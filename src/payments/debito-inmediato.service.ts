import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.service';
import { R4ConectaService, R4Respuesta } from '../r4/r4-conecta.service';
import { PaymentsService } from './payments.service';

/**
 * Flujo de Débito Inmediato (R4 Conecta, guía v3.0):
 *
 *   1. El checkout crea la orden con payment.method='debito_inmediato' y los
 *      datos del pagador (banco, cédula, teléfono) + amountVes (tasa BCV).
 *   2. solicitarOtp(orderId): el banco genera el OTP y se lo envía al cliente.
 *   3. confirmar(orderId, otp): ejecuta el débito.
 *        - ACCP → pago COMPLETED (orden avanza a PREPARING + puntos).
 *        - AC00 → en espera del banco receptor: el front hace polling con
 *          consultarEstado() hasta resolución.
 *        - otro → rechazado (queda PENDING; el cliente puede reintentar OTP).
 *
 * La autorización es por posesión del UUID de la orden (mismo modelo que el
 * seguimiento público): el flujo soporta compras de invitados.
 */
@Injectable()
export class DebitoInmediatoService {
  private readonly logger = new Logger(DebitoInmediatoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r4: R4ConectaService,
    private readonly payments: PaymentsService,
  ) {}

  private async getDebitoPayment(orderId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
      include: {
        order: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            contact: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Orden no encontrada');
    }
    if (payment.method !== 'debito_inmediato') {
      throw new BadRequestException(
        'Esta orden no se paga con débito inmediato',
      );
    }
    return payment;
  }

  /** Datos del pagador en el formato de la guía; falla claro si faltan. */
  private payerDataOf(payment: {
    bank: string | null;
    payerIdDocument: string | null;
    payerPhone: string | null;
    amountVes: Prisma.Decimal | null;
  }) {
    const banco = payment.bank ?? '';
    const cedula = payment.payerIdDocument
      ? R4ConectaService.normalizeCedula(payment.payerIdDocument)
      : '';
    const telefono = payment.payerPhone
      ? R4ConectaService.normalizeTelefono(payment.payerPhone)
      : '';
    if (!/^\d{4}$/.test(banco) || !cedula || !/^\d{11}$/.test(telefono)) {
      throw new BadRequestException(
        'Faltan o son inválidos los datos del pagador (banco, cédula o teléfono)',
      );
    }
    if (!payment.amountVes) {
      throw new BadRequestException(
        'La orden no tiene monto en bolívares (tasa BCV)',
      );
    }
    const monto = Number(payment.amountVes).toFixed(2);
    return { banco, cedula, telefono, monto };
  }

  /** Mezcla datos de la operación R4 en payment.rawWebhook (sin pisar lo previo). */
  private mergeRaw(
    current: Prisma.JsonValue | null,
    patch: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const base =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};
    return { ...base, ...patch } as Prisma.InputJsonValue;
  }

  async solicitarOtp(orderId: string) {
    const payment = await this.getDebitoPayment(orderId);
    if (payment.status === 'COMPLETED') {
      throw new BadRequestException('El pago ya fue confirmado');
    }
    const { banco, cedula, telefono, monto } = this.payerDataOf(payment);

    const res = await this.r4.generarOtp({ banco, monto, telefono, cedula });
    const success = res.success === true || res.code === '202';
    this.logger.log(
      `OTP solicitado orden=${orderId} code=${res.code} success=${success}`,
    );
    return {
      success,
      code: res.code ?? null,
      message:
        res.message ??
        (success
          ? 'El banco envió el código OTP al teléfono del pagador'
          : 'No se pudo generar el OTP'),
    };
  }

  async confirmar(orderId: string, otp: string) {
    const payment = await this.getDebitoPayment(orderId);
    if (payment.status === 'COMPLETED') {
      throw new BadRequestException('El pago ya fue confirmado');
    }
    const { banco, cedula, telefono, monto } = this.payerDataOf(payment);

    // El débito inmediato SIEMPRE crea su pago junto a la orden, así que aquí
    // order/orderId nunca son null (a diferencia de un abono huérfano de pago
    // móvil). El guard es para satisfacer al tipo (orderId ahora es opcional).
    const order = payment.order;
    if (!order || !payment.orderId) {
      throw new NotFoundException('La orden del pago no existe');
    }
    const nombre = (
      payment.payerName ??
      `${order.contact?.firstName ?? order.user?.firstName ?? ''} ${order.contact?.lastName ?? order.user?.lastName ?? ''}`
    ).trim();
    const concepto = `Pedido ${order.orderId}`;

    const res = await this.r4.debitoInmediato({
      banco,
      cedula,
      telefono,
      monto,
      nombre: nombre || 'Cliente Valle Café',
      otp,
      concepto,
    });

    return this.applyResult(payment.id, payment.orderId, res, payment.rawWebhook);
  }

  /** Polling tras AC00: consulta el estado final en el banco y lo aplica. */
  async consultarEstado(orderId: string) {
    const payment = await this.getDebitoPayment(orderId);
    if (payment.status === 'COMPLETED') {
      return {
        success: true,
        code: 'ACCP',
        message: 'Pago confirmado',
        pending: false,
      };
    }

    const raw = payment.rawWebhook as Record<string, unknown> | null;
    const operationId =
      typeof raw?.r4OperationId === 'string' ? raw.r4OperationId : null;
    if (!operationId) {
      throw new BadRequestException(
        'No hay una operación de débito en curso para esta orden',
      );
    }

    const res = await this.r4.consultarOperacion(operationId);
    // `orderId` (param) === payment.orderId aquí (getDebitoPayment busca por él);
    // lo usamos directo porque payment.orderId ahora es opcional en el tipo.
    return this.applyResult(payment.id, orderId, res, payment.rawWebhook);
  }

  /**
   * Cuenta receptora del comercio (settings admin → fallback env). Público.
   * `debitoDisponible` le dice al checkout si mostrar el método débito
   * inmediato (false mientras el banco no entregue el token R4_COMMERCE_ID).
   */
  async getCuentaDestino() {
    const cuenta = await this.r4.getCuentaDestino();
    return { ...cuenta, debitoDisponible: this.r4.isConfigured() };
  }

  /**
   * Config pública de pagos para web/mobile: cuenta receptora + qué métodos se
   * MUESTRAN en el checkout. La visibilidad vive en settings (grupo PAYMENT,
   * 'true'/'false'; ausente = visible) y NO deshabilita el backend — solo
   * oculta la opción en el front. El débito además exige token R4 configurado.
   */
  async getPublicConfig() {
    const cuenta = await this.r4.getCuentaDestino();

    const keys: Record<string, string> = {
      pago_movil: 'payment_method_pago_movil',
      debito_inmediato: 'payment_method_debito_inmediato',
      efectivo: 'payment_method_efectivo',
      puntos: 'payment_method_puntos',
    };
    const map: Record<string, string> = {};
    try {
      const rows = await this.prisma.setting.findMany({
        where: { metaKey: { in: Object.values(keys) } },
      });
      for (const row of rows) map[row.metaKey] = (row.metaValue ?? '').trim();
    } catch {
      // settings no disponibles → todos visibles (default)
    }
    const visible = (method: keyof typeof keys) =>
      map[keys[method]] !== 'false';

    return {
      cuenta,
      debitoDisponible: this.r4.isConfigured(),
      methods: {
        pago_movil: visible('pago_movil'),
        debito_inmediato: visible('debito_inmediato') && this.r4.isConfigured(),
        efectivo: visible('efectivo'),
        puntos: visible('puntos'),
      },
    };
  }

  /**
   * Interpreta la respuesta del banco y actualiza el pago:
   *  ACCP → COMPLETED (vía PaymentsService.updateStatus: orden + puntos).
   *  AC00 → guarda el id de operación y pide polling.
   *  otro → rechazo (queda PENDING para permitir reintento con nuevo OTP).
   */
  private async applyResult(
    paymentId: string,
    orderId: string,
    res: R4Respuesta,
    currentRaw: Prisma.JsonValue | null,
  ) {
    const code = res.code ?? 'SIN_CODIGO';
    const operationId = (res.id ?? res.Id ?? null) as string | null;

    const rawPatch: Record<string, unknown> = {
      provider: 'R4',
      tipo: 'DEBITO_INMEDIATO',
      r4LastCode: code,
      r4LastMessage: res.message ?? null,
      r4LastAt: new Date().toISOString(),
      ...(operationId ? { r4OperationId: operationId } : {}),
      ...(res.reference ? { r4Reference: res.reference } : {}),
    };

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        rawWebhook: this.mergeRaw(currentRaw, rawPatch),
        ...(res.reference ? { reference: String(res.reference) } : {}),
      },
    });

    if (code === 'ACCP') {
      // Confirmación atómica + avance de orden + puntos (idempotente).
      await this.payments.updateStatus(paymentId, 'COMPLETED');
      this.logger.log(
        `Débito ACCP orden=${orderId} ref=${res.reference ?? '—'}`,
      );
      return {
        success: true,
        code,
        message: res.message ?? 'Operación Aceptada',
        reference: res.reference ?? null,
        pending: false,
      };
    }

    if (code === 'AC00') {
      return {
        success: false,
        code,
        message:
          res.message ?? 'Operación en espera de respuesta del banco receptor',
        pending: true,
      };
    }

    this.logger.warn(
      `Débito rechazado orden=${orderId} code=${code}: ${res.message ?? ''}`,
    );
    return {
      success: false,
      code,
      message: res.message ?? 'Operación rechazada por el banco',
      pending: false,
    };
  }
}
