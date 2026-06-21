import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { R4WebhookNotificaDto } from './dto/r4-webhook-notifica.dto';
import { R4WebhookConsultaDto } from './dto/r4-webhook-consulta.dto';
import { gcpLog } from '../common/gcp-logger';

// Tolerancia al comparar el monto del abono (Bs) contra el esperado del pago.
const AMOUNT_TOLERANCE = 0.02; // 2%

@Injectable()
export class R4WebhooksService {
  private readonly logger = new Logger(R4WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly loyalty: LoyaltyService,
  ) {}

  // Validación BLOQUEANTE del token: R4 es un llamador servidor-a-servidor que se
  // autentica con un secreto compartido. Una petición sin token válido se rechaza
  // (401), de modo que un POST forjado NO pueda confirmar órdenes sin pago real.
  private validateToken(authToken?: string): void {
    const expected = this.config.get<string>('R4_WEBHOOK_TOKEN');
    if (!expected) {
      this.logger.error('R4_WEBHOOK_TOKEN no configurado: se rechaza el webhook R4');
      throw new UnauthorizedException('Webhook no configurado');
    }
    if (!authToken || authToken !== expected) {
      this.logger.error('Token de webhook R4 inválido o ausente');
      throw new UnauthorizedException('Token de webhook inválido');
    }
  }

  // Allowlist de IPs de origen (guía R4: "solo permitir request de estas IP").
  // R4_ALLOWED_IPS = lista separada por ';' o ',' (en Cloud Run se usa ';'
  // porque --set-env-vars reserva la coma); vacía/ausente = deshabilitado
  // (el token sigue siendo la barrera principal).
  //
  // ⚠️ ACTUALMENTE SIN USO (jun 2026): las llamadas en handleNotifica/handleConsulta
  // están comentadas. Se conserva para reactivar el filtrado por IP una vez
  // confirmemos —vía los logs r4.webhook.*.sourceip— las IP reales de R4.
  private validateSourceIp(sourceIp?: string): void {
    const raw = this.config.get<string>('R4_ALLOWED_IPS')?.trim();
    if (!raw) return;
    const allowed = raw.split(/[;,\s]+/).map((ip) => ip.trim()).filter(Boolean);
    if (!sourceIp || !allowed.includes(sourceIp)) {
      this.logger.error(
        `Webhook R4 desde IP no permitida: ${sourceIp ?? 'desconocida'}`,
      );
      throw new UnauthorizedException('Origen no permitido');
    }
  }

  // Normaliza un código de banco a 4 dígitos. null si no hay dígitos.
  private normalizeBank(code?: string): string | null {
    const digits = (code ?? '').replace(/\D/g, '');
    return digits ? digits.padStart(4, '0') : null;
  }

  // Parsea el monto (Bs) tolerando coma decimal / separador de miles (locale VE).
  // Devuelve un número > 0, o null si no es parseable.
  private parseMonto(raw?: string | number): number | null {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s) return null;
    if (s.includes(',')) {
      // "1.234,56" -> "1234.56" ; "12,50" -> "12.50"
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Notificación de abono. Empareja contra `payments` por referencia y confirma de
  // forma ATÓMICA e IDEMPOTENTE (a prueba de reintentos/concurrencia de R4).
  async handleNotifica(
    body: R4WebhookNotificaDto,
    authToken?: string,
    sourceIp?: string,
  ): Promise<{ abono: boolean }> {
    // IP allowlist DESHABILITADA (jun 2026): bloqueaba todo el tráfico legítimo
    // —incluidas las pruebas desde Swagger— y conceptualmente este filtrado por
    // origen corresponde a la capa de red/CORS, no a la lógica del webhook. La
    // dejamos comentada y SOLO logueamos la IP de origen para descubrir, en
    // producción, desde qué IP(s) llama R4 realmente.
    // this.validateSourceIp(sourceIp);
    gcpLog('NOTICE', 'r4.webhook.notifica.sourceip', {
      phase: 'notifica',
      sourceIp: sourceIp ?? null,
      allowlist: this.config.get<string>('R4_ALLOWED_IPS') ?? null,
      reference: body?.Referencia ?? null,
    });
    this.validateToken(authToken); // bloqueante: lanza 401 si el token no es válido

    if (!body?.CodigoRed || !body?.Referencia || !body?.TelefonoEmisor || !body?.Monto) {
      return { abono: false };
    }
    if (body.CodigoRed !== '00') {
      return { abono: false };
    }

    const monto = this.parseMonto(body.Monto);
    if (monto == null) {
      this.logger.error(
        `Monto inválido en webhook R4 (Referencia=${body.Referencia}, Monto=${body.Monto}); requiere revisión manual`,
      );
      return { abono: true };
    }

    try {
      const payment = await this.prisma.payment.findFirst({
        where: { reference: body.Referencia },
        orderBy: { createdAt: 'desc' },
        select: { id: true, orderId: true, status: true, amountVes: true },
      });

      if (!payment) {
        // Abono sin orden todavía: en pago móvil el cliente suele pagar PRIMERO
        // y el abono llega antes de crear la orden. Lo guardamos como un pago
        // "huérfano" (orderId=null, status COMPLETED) para NO perder el dinero;
        // el checkout lo reclamará luego por `reference`. Idempotente: un
        // reintento de R4 caerá en el findFirst de arriba (ya COMPLETED).
        const orphan = await this.prisma.payment.create({
          data: {
            method: 'pago_movil',
            status: 'COMPLETED',
            amount: 0, // USD desconocido hasta vincular la orden (lo fija el checkout)
            currency: 'USD',
            reference: body.Referencia,
            amountVes: new Prisma.Decimal(monto),
            bank: this.normalizeBank(body.BancoEmisor),
            payerPhone: body.TelefonoEmisor,
            confirmedAt: new Date(),
            rawWebhook: body as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        this.logger.log(
          `Abono R4 guardado sin orden (Referencia=${body.Referencia}, Monto=${monto}) → a la espera del checkout`,
        );
        gcpLog('NOTICE', 'r4.webhook.notifica.stored_unlinked', {
          phase: 'notifica',
          reference: body.Referencia,
          paymentId: orphan.id,
          monto,
          banco: body.BancoEmisor ?? null,
          telefonoEmisor: body.TelefonoEmisor ?? null,
        });
        return { abono: true };
      }

      if (payment.status === 'COMPLETED') {
        gcpLog('INFO', 'r4.webhook.notifica.duplicate', {
          phase: 'notifica',
          reference: body.Referencia,
          paymentId: payment.id,
          orderId: payment.orderId,
        });
        return { abono: true }; // idempotente: ya confirmado
      }

      // Defensa adicional: el cliente paga el monto en Bs mostrado en el checkout
      // (payment.amountVes). Si difiere demasiado, NO confirmamos automáticamente.
      if (payment.amountVes != null) {
        const expected = Number(payment.amountVes);
        if (expected > 0 && Math.abs(monto - expected) / expected > AMOUNT_TOLERANCE) {
          this.logger.warn(
            `Monto del abono R4 no coincide (esperado≈${expected}, recibido=${monto}, Referencia=${body.Referencia}); requiere revisión manual`,
          );
          gcpLog('WARNING', 'r4.webhook.notifica.amount_mismatch', {
            phase: 'notifica',
            reference: body.Referencia,
            paymentId: payment.id,
            orderId: payment.orderId,
            expected,
            monto,
          });
          return { abono: true };
        }
      }

      // Confirmación atómica e idempotente: el updateMany sólo afecta filas que
      // siguen PENDING/PROCESSING (estado del PAGO); si count===1, avanzamos la
      // orden de PENDING a PREPARING (pago confirmado → arranca preparación).
      const confirmed = await this.prisma.$transaction(async (tx) => {
        const upd = await tx.payment.updateMany({
          where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING'] } },
          data: {
            status: 'COMPLETED',
            confirmedAt: new Date(),
            bank: this.normalizeBank(body.BancoEmisor),
            payerPhone: body.TelefonoEmisor,
            amountVes: new Prisma.Decimal(monto),
            rawWebhook: body as Prisma.InputJsonValue,
          },
        });
        if (upd.count === 1) {
          // Sólo avanza si la orden sigue PENDING (no la mueve hacia atrás).
          // orderId puede ser null en un pago huérfano (sin orden aún); ahí no
          // hay nada que avanzar.
          if (payment.orderId) {
            await tx.order.updateMany({
              where: { id: payment.orderId, status: 'PENDING' },
              data: { status: 'PREPARING' },
            });
          }
          return true;
        }
        return false;
      });

      if (confirmed) {
        this.logger.log(`Abono R4 confirmado (Referencia=${body.Referencia}) → orden PREPARING`);
        gcpLog('NOTICE', 'r4.webhook.notifica.confirmed', {
          phase: 'notifica',
          reference: body.Referencia,
          paymentId: payment.id,
          orderId: payment.orderId,
          monto,
        });
        // Pago COMPLETED → acredita los puntos al cliente (idempotente, best-effort).
        if (payment.orderId) {
          await this.loyalty.awardForOrder(payment.orderId);
        }
      }
      return { abono: true };
    } catch (error) {
      // Error interno: el dinero ya entró → confirmamos para que R4 no lo reverse.
      this.logger.error(
        `Error procesando notificación R4 (Referencia=${body.Referencia}): ${(error as Error)?.message ?? error}`,
      );
      return { abono: true };
    }
  }

  // Consulta de R4: validación bloqueante; confirmamos disponibilidad.
  async handleConsulta(
    _body: R4WebhookConsultaDto,
    authToken?: string,
    sourceIp?: string,
  ): Promise<{ status: boolean }> {
    // IP allowlist DESHABILITADA: ver nota en handleNotifica. Solo logueamos.
    // this.validateSourceIp(sourceIp);
    gcpLog('NOTICE', 'r4.webhook.consulta.sourceip', {
      phase: 'consulta',
      sourceIp: sourceIp ?? null,
      allowlist: this.config.get<string>('R4_ALLOWED_IPS') ?? null,
    });
    this.validateToken(authToken);
    return { status: true };
  }
}
