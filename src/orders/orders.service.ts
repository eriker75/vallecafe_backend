import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { AnalyticsPeriod, OrderAnalyticsQueryDto } from './dto/order-analytics-query.dto';
import { ProductProfitabilityQueryDto } from './dto/product-profitability-query.dto';
import { PrismaService } from '../database/database.service';
import { buildOrderBy } from '../common/sort/build-order-by';
import { BcvService } from '../bcv/bcv.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { UsersService } from '../users/users.service';
import { Prisma } from '@prisma/client';
import { OrderStatus } from './order-status.enum';
import { canAccessVisibility } from '../common/account.constants';
import {
  DEFAULT_TIMEZONE,
  getStoreStatus,
  HOURS_GROUP,
  HOURS_POLICY_KEY,
  HOURS_SCHEDULE_KEY,
  HOURS_TIMEZONE_KEY,
  nextOpeningLabel,
  parseSchedule,
} from '../common/store-hours';

// Puntos que otorga una unidad de producto. Si el producto define `pointsEarned`
// se usa ese valor; si no, se aplica la tasa por defecto (1 USD → 10 pts), que
// es la misma que muestra la web en la ficha de producto.
const DEFAULT_POINTS_PER_USD = 10;
function pointsForUnit(price: Prisma.Decimal, pointsEarned: number | null): number {
  if (pointsEarned != null) return Math.max(0, Math.floor(pointsEarned));
  return Math.floor(Number(price) * DEFAULT_POINTS_PER_USD);
}

// Precio unitario que se cobra (snapshot): `offerPrice` si está definido y es menor que
// `price`; si no, `price`. SIEMPRE se resuelve en el servidor: el cliente nunca envía
// precios. Hay un único precio (la segmentación B2B/B2C solo afecta la visibilidad).
function effectiveUnitPrice(product: {
  price: Prisma.Decimal;
  offerPrice: Prisma.Decimal | null;
}): Prisma.Decimal {
  if (product.offerPrice != null && product.offerPrice.lessThan(product.price)) {
    return product.offerPrice;
  }
  return product.price;
}

// Ventana (días) durante la cual el seguimiento público de un pedido COMPLETED
// sigue siendo visible para cualquiera con el enlace. Pasado ese tiempo, sólo el
// dueño autenticado o un admin pueden verlo.
const TRACKING_PUBLIC_WINDOW_DAYS = 7;

// Columnas ordenables desde la tabla de órdenes del admin (cabeceras clickeables).
const ORDER_SORT_COLUMNS: Record<
  string,
  (dir: Prisma.SortOrder) => Prisma.OrderOrderByWithRelationInput
> = {
  customer: (dir) => ({ user: { firstName: dir } }),
  createdAt: (dir) => ({ createdAt: dir }),
  items: (dir) => ({ items: { _count: dir } }),
  total: (dir) => ({ total: dir }),
  status: (dir) => ({ status: dir }),
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bcvService: BcvService,
    private readonly loyalty: LoyaltyService,
    private readonly usersService: UsersService,
  ) {}

  private readonly orderInclude = {
    // NO exponer el hash de password: seleccionamos sólo los campos públicos del
    // usuario (antes `user: true` filtraba la contraseña en cada respuesta).
    user: {
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    },
    coupon: true,
    shippingAddress: true,
    contact: true,
    payment: true,
    items: {
      // `costSnapshot` (item) y `product.cost` son admin-only: se omiten de TODA
      // respuesta de orden (la sirven tanto el admin como el dueño). Las finanzas
      // leen el costo con queries dedicadas (getFinanceAnalytics / getProductProfitability).
      omit: { costSnapshot: true },
      include: {
        product: { omit: { cost: true } },
      },
    },
  } as const;

  // Mapa productId → costo actual, para snapshotear costSnapshot en órdenes creadas
  // o editadas manualmente por el admin (el checkout snapshotea dentro de su propia tx).
  private async costByProductMap(
    productIds: string[],
  ): Promise<Map<string, Prisma.Decimal | null>> {
    const ids = [...new Set(productIds)];
    if (!ids.length) return new Map();
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, cost: true },
    });
    return new Map(products.map((p) => [p.id, p.cost]));
  }

  async create(createOrderDto: CreateOrderDto) {
    const { items, ...orderData } = createOrderDto;
    const costByProduct = await this.costByProductMap(items.map((i) => i.productId));

    return this.prisma.order.create({
      data: {
        ...orderData,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            costSnapshot: costByProduct.get(item.productId) ?? null,
          })),
        },
      },
      include: this.orderInclude,
    });
  }

  // Rechaza el checkout si la tienda está fuera de horario Y la política es
  // 'block'. Sin horario configurado (o JSON inválido) no se aplica nada: la
  // tienda se comporta como siempre abierta.
  private async assertWithinServiceHours() {
    const settings = await this.prisma.setting.findMany({
      where: { metaGroup: HOURS_GROUP },
      select: { metaKey: true, metaValue: true },
    });
    const byKey = new Map(settings.map((s) => [s.metaKey, s.metaValue]));
    if (byKey.get(HOURS_POLICY_KEY) !== 'block') return;

    const schedule = parseSchedule(byKey.get(HOURS_SCHEDULE_KEY));
    if (!schedule) return;

    const status = getStoreStatus(schedule, byKey.get(HOURS_TIMEZONE_KEY) || DEFAULT_TIMEZONE);
    if (status.isOpen) return;

    const label = nextOpeningLabel(status.nextOpening);
    throw new BadRequestException(
      label
        ? `La tienda está fuera de horario. Podrás realizar tu pedido ${label}.`
        : 'La tienda está fuera de horario en este momento.',
    );
  }

  // ── Checkout (invitado o autenticado) ─────────────────────────────────────
  // Guarda al comprador como `customer` (lo crea si no existe por email), crea
  // su Contact, su Address de envío y el Payment, y deja el pedido en PENDING.
  // El precio y el total se calculan en el servidor a partir de los productos;
  // el cliente NUNCA envía precios. Si llega un `authUser` (token válido) se
  // asocia el pedido a su cuenta sin sobrescribir su perfil.
  async createCheckout(
    dto: CreatePublicOrderDto,
    authUser?: { id: string; password?: string | null } | null,
  ) {
    const { items, couponId } = dto;
    const email = dto.email.toLowerCase();

    // Segmento comercial del comprador. Solo un usuario AUTENTICADO puede ser
    // mayorista (B2B); los invitados y las cuentas nuevas son B2C. De esto dependen
    // el precio (wholesalePrice), la elegibilidad por visibilidad y los puntos.
    let buyerAccountType = 'B2C';
    if (authUser?.id) {
      const buyer = await this.prisma.user.findUnique({
        where: { id: authUser.id },
        select: { accountType: true },
      });
      if (buyer?.accountType === 'B2B') buyerAccountType = 'B2B';
    }
    const isWholesaler = buyerAccountType === 'B2B';

    // Los mayoristas NO participan del sistema de puntos: no pueden pagar con puntos.
    if (isWholesaler && dto.paymentMethod === 'puntos') {
      throw new BadRequestException('El pago con puntos no está disponible para cuentas mayoristas');
    }

    // El débito inmediato (R4) necesita los datos del pagador desde el inicio:
    // con ellos el banco genera el OTP y ejecuta el cobro tras crear la orden.
    if (dto.paymentMethod === 'debito_inmediato') {
      if (!dto.bankCode || !dto.payerIdDocument?.trim() || !dto.payerPhone?.trim()) {
        throw new BadRequestException(
          'El débito inmediato requiere banco, cédula y teléfono del pagador',
        );
      }
    }

    // Horario de servicio (settings grupo HOURS). Solo bloquea si la política
    // configurada es 'block'; con 'notify' (default) el pedido se acepta y el
    // front avisa que se procesará en la próxima apertura. La validación vive
    // en el servidor porque el aviso del front es informativo y saltable.
    await this.assertWithinServiceHours();

    // La tasa BCV se calcula SIEMPRE en el servidor (el `bcvRate` del cliente se
    // ignora). Sólo es relevante para pago_movil.
    const bcv = await this.bcvService.getRateValue();

    // Normaliza un código de banco a 4 dígitos; null si no hay dígitos.
    const norm = (c?: string) => {
      const d = (c ?? '').replace(/\D/g, '');
      return d ? d.padStart(4, '0') : null;
    };

    // Se resuelven dentro de la transacción y se leen después para (si aplica)
    // emitir una sesión de auto-login al comprador invitado.
    let userId = '';
    let shouldIssueSession = false;
    // Si en pago móvil se reclama un abono previo ya confirmado, guardamos el id
    // de la orden para acreditar puntos DESPUÉS de la transacción.
    let linkedPaidOrderId: string | null = null;
    // Tolerancia al comparar el monto del abono (Bs) contra el esperado (igual
    // que en el webhook de R4).
    const PAGO_MOVIL_TOLERANCE = 0.02;

    const order = await this.prisma.$transaction(async (tx) => {
      // 1) Cargar los productos referenciados y validar que todos existan.
      const productIds = items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          price: true,
          offerPrice: true,
          cost: true,
          visibility: true,
          stock: true,
          pointsEarned: true,
        },
      });

      const productById = new Map(products.map((p) => [p.id, p]));
      const missing = productIds.filter((id) => !productById.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Productos no encontrados: ${missing.join(', ')}`);
      }

      // Elegibilidad por visibilidad: un comprador no puede adquirir un producto
      // que no debería ver (p. ej. un B2C comprando un WHOLESALE_ONLY por id
      // directo). Se re-valida en el servidor; el filtrado del catálogo no basta.
      const notAllowed = products.filter(
        (p) => !canAccessVisibility(buyerAccountType, p.visibility),
      );
      if (notAllowed.length > 0) {
        throw new BadRequestException(
          `Estos productos no están disponibles para tu tipo de cuenta: ${notAllowed
            .map((p) => p.name)
            .join(', ')}`,
        );
      }

      // 1b) Validar disponibilidad de stock ANTES de cobrar/crear nada. Se
      //     consolidan cantidades por si un producto llega repetido en `items`.
      const qtyByProduct = new Map<string, number>();
      for (const item of items) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
      }
      for (const [pid, qty] of qtyByProduct) {
        const product = productById.get(pid)!;
        if (product.stock < qty) {
          throw new BadRequestException(
            `Stock insuficiente para "${product.name}": disponibles ${product.stock}, solicitados ${qty}`,
          );
        }
      }

      // 2) Determinar al comprador.
      //    - Autenticado (token): se usa su id; NO se toca su perfil.
      //    - Invitado: emparejado por email.
      //        · no existe → se crea como invitado (sin contraseña) rol customer.
      //        · existe pero invitado (sin contraseña) → se refrescan sus datos.
      //        · existe con contraseña → sólo se le asocia el pedido (no se toca).
      // `shouldIssueSession` queda true sólo para invitados SIN contraseña, para
      // luego autenticarlos automáticamente. Nunca para una cuenta con contraseña
      // (evita robo de cuenta) ni para alguien ya autenticado.
      if (authUser?.id) {
        userId = authUser.id;
      } else {
        const existing = await tx.user.findUnique({
          where: { email },
          select: { id: true, password: true },
        });

        if (!existing) {
          const created = await tx.user.create({
            data: {
              email,
              firstName: dto.firstName,
              lastName: dto.lastName,
              phone: dto.phone,
              address: dto.address,
              city: dto.city ?? '',
              state: dto.state ?? '',
              zip: dto.zip ?? '',
              country: dto.country ?? 'Venezuela',
              role: 'customer',
            },
            select: { id: true },
          });
          userId = created.id;
          shouldIssueSession = true; // invitado nuevo (cuenta sin contraseña)
        } else {
          userId = existing.id;
          if (!existing.password) {
            await tx.user.update({
              where: { id: existing.id },
              data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                phone: dto.phone,
                address: dto.address,
                ...(dto.city !== undefined ? { city: dto.city } : {}),
                ...(dto.state !== undefined ? { state: dto.state } : {}),
                ...(dto.zip !== undefined ? { zip: dto.zip } : {}),
                ...(dto.country !== undefined ? { country: dto.country } : {}),
              },
            });
            shouldIssueSession = true; // invitado existente (cuenta sin contraseña)
          }
          // con contraseña: cuenta real → sólo se asocia el pedido, sin sesión.
        }
      }

      // 3) Upsert del Contact (emparejado por email).
      const contact = await tx.contact.upsert({
        where: { email },
        create: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email,
          phone: dto.phone,
          userId,
        },
        update: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          userId,
        },
      });
      const contactId = contact.id;

      // 4) Crear la dirección de envío vinculada al usuario.
      const address = await tx.address.create({
        data: {
          userId,
          label: dto.addressLabel ?? null,
          recipientName: `${dto.firstName} ${dto.lastName}`.trim(),
          phone: dto.phone,
          line1: dto.address,
          city: dto.city ?? '',
          state: dto.state ?? '',
          zip: dto.zip ?? '',
          country: dto.country ?? 'Venezuela',
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
        },
      });
      const shippingAddressId = address.id;

      // PostGIS DESHABILITADO (diferido): la columna `addresses.location` está
      // comentada en el schema porque requiere la extensión `postgis`. Lat/lng ya
      // se guardan en columnas Float. Para reactivar: habilita postgis, descomenta
      // la columna en el schema y este bloque — IDEALMENTE FUERA de la transacción
      // (con this.prisma.$executeRaw + try/catch) para que un fallo de PostGIS
      // nunca revierta una orden válida:
      // if (dto.latitude != null && dto.longitude != null) {
      //   await this.prisma.$executeRaw`UPDATE addresses SET location = ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326)::geography WHERE id = ${address.id}`;
      // }

      // 5) Construir los items con el precio del servidor y calcular el subtotal.
      //    El precio (oferta si aplica) se congela en el OrderItem (snapshot), junto
      //    con el costo, al momento de la compra.
      const orderItems = items.map((item) => {
        const product = productById.get(item.productId)!;
        return {
          productId: item.productId,
          quantity: item.quantity,
          price: effectiveUnitPrice(product),
          // Snapshot del costo (admin-only) para el cálculo de utilidades. null si el
          // producto aún no tiene costo cargado.
          costSnapshot: product.cost,
        };
      });

      const subtotal = orderItems.reduce(
        (acc, item) => acc.plus(new Prisma.Decimal(item.price).times(item.quantity)),
        new Prisma.Decimal(0),
      );

      // 5b) Cupón: SIEMPRE se re-valida en el servidor (nunca se confía en el
      //     descuento que envíe el cliente). Se calcula el descuento real y se
      //     incrementa su contador de uso de forma atómica dentro de la transacción.
      let discount = new Prisma.Decimal(0);
      let validCouponId: string | undefined;
      if (couponId) {
        const coupon = await tx.coupon.findUnique({
          where: { id: couponId },
          include: { couponProducts: true },
        });
        if (!coupon) throw new BadRequestException('Cupón no encontrado');
        if (!coupon.isActive) throw new BadRequestException('El cupón está inactivo');
        if (coupon.expiryDate && coupon.expiryDate < new Date())
          throw new BadRequestException('El cupón está vencido');
        if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
          throw new BadRequestException('El cupón alcanzó su límite de uso');

        const allowed = coupon.couponProducts.map((cp) => cp.productId);
        if (allowed.length) {
          const invalid = productIds.filter((id) => !allowed.includes(id));
          if (invalid.length)
            throw new BadRequestException('El cupón no aplica a algunos productos del carrito');
        }

        discount =
          coupon.discountType === 'PERCENTAGE'
            ? subtotal.times(coupon.amount).dividedBy(100)
            : new Prisma.Decimal(coupon.amount);
        // El descuento nunca supera el subtotal ni baja de cero.
        if (discount.greaterThan(subtotal)) discount = subtotal;
        if (discount.lessThan(0)) discount = new Prisma.Decimal(0);
        validCouponId = coupon.id;

        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usageCount: { increment: 1 } },
        });
      }

      const total = subtotal.minus(discount);

      // 5c) Puntos de fidelidad que otorgará el pedido (snapshot). Se acreditan
      //     al saldo del cliente cuando el pago quede COMPLETED (LoyaltyService).
      //     Los mayoristas (B2B) NO participan del sistema de puntos → 0.
      const pointsEarned = isWholesaler
        ? 0
        : orderItems.reduce(
            (acc, item) =>
              acc +
              pointsForUnit(
                productById.get(item.productId)!.price,
                productById.get(item.productId)!.pointsEarned ?? null,
              ) * item.quantity,
            0,
          );

      // 5d) Descontar stock (ya validado en 1b). decrement es atómico en SQL.
      for (const [pid, qty] of qtyByProduct) {
        await tx.product.update({ where: { id: pid }, data: { stock: { decrement: qty } } });
      }

      // 6) Construir los datos del pago.
      //    - bcvRate/amountVes aplican a los métodos en bolívares
      //      (pago_movil y debito_inmediato).
      //    - El monto del pago es el TOTAL ya con el descuento del cupón aplicado.
      //    - bank = código del banco DEL CLIENTE (normalizado a 4 dígitos);
      //      para efectivo/puntos/yummy queda sin asignar (null).
      //    - reference: en pago_movil la aporta el cliente; en débito inmediato
      //      la asigna el banco al aprobar (ACCP).
      const isPagoMovil = dto.paymentMethod === 'pago_movil';
      const isDebito = dto.paymentMethod === 'debito_inmediato';
      const paysInBolivares = isPagoMovil || isDebito;
      const paymentData: Prisma.PaymentCreateWithoutOrderInput = {
        method: dto.paymentMethod,
        status: 'PENDING',
        amount: total,
        currency: 'USD',
        bank: paysInBolivares ? norm(dto.bankCode) : null,
        amountVes: paysInBolivares ? new Prisma.Decimal(total).times(bcv) : null,
      };
      if (paysInBolivares) {
        paymentData.reference = isPagoMovil ? (dto.paymentReference ?? null) : null;
        paymentData.payerIdDocument = dto.payerIdDocument ?? null;
        paymentData.payerName = dto.payerName ?? null;
        paymentData.payerPhone = dto.payerPhone ?? null;
        paymentData.bcvRate = bcv;
      }

      // 7) Crear el pedido. En pago móvil, si ya existe un abono "huérfano" con
      //    esta referencia (el cliente pagó ANTES de crear la orden), lo
      //    reclamamos en vez de crear un pago nuevo.
      const orphan =
        isPagoMovil && paymentData.reference
          ? await tx.payment.findFirst({
              where: { reference: paymentData.reference, orderId: null },
              orderBy: { createdAt: 'desc' },
            })
          : null;

      // Caso normal (sin abono previo): pedido PENDING con su pago anidado.
      if (!orphan) {
        return tx.order.create({
          data: {
            userId,
            status: OrderStatus.PENDING,
            discount,
            ...(validCouponId ? { couponId: validCouponId } : {}),
            total,
            shipping: 0,
            pointsEarned,
            notes: dto.notes ?? null,
            shippingAddressId,
            contactId,
            items: { create: orderItems },
            payment: { create: paymentData },
          },
          include: this.orderInclude,
        });
      }

      // Hay un abono previo. ¿El monto en Bs cuadra con lo esperado del pedido?
      const expectedVes = Number(new Prisma.Decimal(total).times(bcv));
      const actualVes = orphan.amountVes != null ? Number(orphan.amountVes) : null;
      const amountOk =
        actualVes == null ||
        (expectedVes > 0 &&
          Math.abs(actualVes - expectedVes) / expectedVes <= PAGO_MOVIL_TOLERANCE);
      const paid = orphan.status === 'COMPLETED' && amountOk;

      const created = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          discount,
          ...(validCouponId ? { couponId: validCouponId } : {}),
          total,
          shipping: 0,
          pointsEarned,
          notes: dto.notes ?? null,
          shippingAddressId,
          contactId,
          items: { create: orderItems },
        },
      });

      // Reclamo atómico: `orderId: null` en el where evita que dos checkouts
      // tomen el mismo abono. Al vincular fijamos el monto USD del pedido y la
      // tasa, conservando los datos del pagador que ya trajo el abono.
      const claim = await tx.payment.updateMany({
        where: { id: orphan.id, orderId: null },
        data: {
          orderId: created.id,
          amount: total,
          currency: 'USD',
          bcvRate: bcv,
          payerIdDocument: orphan.payerIdDocument ?? dto.payerIdDocument ?? null,
          payerName: orphan.payerName ?? dto.payerName ?? null,
          payerPhone: orphan.payerPhone ?? dto.payerPhone ?? null,
        },
      });

      if (claim.count !== 1) {
        // Otro checkout reclamó el abono primero: este pedido lleva su propio
        // pago PENDING (se confirmará por webhook/admin).
        await tx.payment.create({
          data: { ...paymentData, order: { connect: { id: created.id } } },
        });
      } else if (paid) {
        // Abono válido y ya COMPLETED → el pedido arranca preparación.
        await tx.order.update({
          where: { id: created.id },
          data: { status: OrderStatus.PREPARING },
        });
        linkedPaidOrderId = created.id;
      }
      // Si se reclamó pero el monto NO cuadra, el pedido queda PENDING con su
      // pago COMPLETED vinculado: señal para revisión manual en el admin.

      const full = await tx.order.findUnique({
        where: { id: created.id },
        include: this.orderInclude,
      });
      return full!;
    });

    // Abono previo reclamado y confirmado → acredita puntos (idempotente).
    if (linkedPaidOrderId) {
      try {
        await this.loyalty.awardForOrder(linkedPaidOrderId);
      } catch {
        // best-effort: el pedido ya quedó pagado; los puntos no son críticos.
      }
    }

    // Auto-login del comprador invitado (cuenta sin contraseña): emitimos una
    // sesión real (token + datos del usuario) para que vea sus pedidos/wishlist en
    // /account. NO se emite si ya venía autenticado ni si el email pertenece a una
    // cuenta con contraseña (eso sería robo de cuenta).
    if (shouldIssueSession) {
      try {
        const auth = await this.usersService.buildSessionForUser(userId);
        return { ...order, auth };
      } catch {
        // Si falla emitir la sesión, el pedido YA se creó: devolvemos la orden sin
        // `auth` (el front tolera su ausencia y simplemente no auto-loguea).
        return order;
      }
    }
    return order;
  }

  // Pedidos del cliente autenticado, del más reciente al más antiguo.
  findByUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: this.orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll({ limit, offset, status, dateFrom, dateTo, minTotal, maxTotal, search, sortBy, order }: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = {};

    if (status) where.status = status;

    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
      };
    }

    if (minTotal !== undefined || maxTotal !== undefined) {
      where.total = {
        ...(minTotal !== undefined ? { gte: minTotal } : {}),
        ...(maxTotal !== undefined ? { lte: maxTotal } : {}),
      };
    }

    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const orderBy = buildOrderBy(sortBy, order, ORDER_SORT_COLUMNS, {
      createdAt: 'desc',
    });

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: this.orderInclude,
        orderBy,
        take: limit,
        skip: offset,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data, total, limit, offset };
  }

  async getOrderStats() {
    const statuses = [
      OrderStatus.PENDING,
      OrderStatus.PREPARING,
      OrderStatus.SENDING,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
    ];
    const counts = await this.prisma.$transaction(
      statuses.map((s) => this.prisma.order.count({ where: { status: s } })),
    );
    return {
      PENDING: counts[0],
      PREPARING: counts[1],
      SENDING: counts[2],
      COMPLETED: counts[3],
      CANCELLED: counts[4],
      total: counts.reduce((a, b) => a + b, 0),
    };
  }

  // Coordenadas de las compras (órdenes cuya dirección de envío está
  // geolocalizada) para pintar el mapa del admin. Devuelve sólo lo necesario.
  async getOrderLocations() {
    const orders = await this.prisma.order.findMany({
      where: {
        shippingAddress: { latitude: { not: null }, longitude: { not: null } },
      },
      select: {
        id: true,
        total: true,
        status: true,
        createdAt: true,
        shippingAddress: {
          select: {
            latitude: true,
            longitude: true,
            city: true,
            state: true,
            recipientName: true,
            line1: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders
      .filter((o) => o.shippingAddress?.latitude != null && o.shippingAddress?.longitude != null)
      .map((o) => ({
        orderId: o.id,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt,
        latitude: o.shippingAddress!.latitude as number,
        longitude: o.shippingAddress!.longitude as number,
        city: o.shippingAddress!.city,
        state: o.shippingAddress!.state,
        recipientName: o.shippingAddress!.recipientName,
        line1: o.shippingAddress!.line1,
      }));
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: this.orderInclude,
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    return order;
  }

  // Seguimiento público: devuelve sólo un subconjunto seguro (sin email,
  // cédula, teléfono ni dirección) porque la ruta es pública. `authUser` (opcional)
  // permite que el dueño o un admin vean un pedido cuyo seguimiento público expiró.
  async findOneForTracking(id: string, authUser?: { id: string; role?: string } | null) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        total: true,
        createdAt: true,
        completedAt: true,
        items: {
          select: { id: true, quantity: true, price: true, product: { select: { name: true } } },
        },
        payment: { select: { method: true, status: true } },
      },
    });
    if (!order) throw new NotFoundException(`Pedido ${id} no encontrado`);

    // Expiración del seguimiento PÚBLICO: pasados TRACKING_PUBLIC_WINDOW_DAYS días
    // desde que el pedido se completó, sólo el dueño autenticado o un admin pueden
    // verlo. Antes de completarse (o dentro de la ventana) sigue siendo público.
    if (order.status === OrderStatus.COMPLETED && order.completedAt) {
      const windowMs = TRACKING_PUBLIC_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const expired = order.completedAt.getTime() + windowMs < Date.now();
      const isOwner = !!authUser && authUser.id === order.userId;
      const isAdmin = !!authUser && authUser.role === 'admin';
      if (expired && !isOwner && !isAdmin) {
        throw new ForbiddenException(
          'El seguimiento público de este pedido expiró. Inicia sesión para verlo.',
        );
      }
    }

    // No exponer userId/completedAt en la respuesta pública.
    const { userId: _userId, completedAt: _completedAt, ...publicOrder } = order;
    return publicOrder;
  }

  // Lee el switch de "ajustes avanzados" que decide si, al cancelar una orden
  // que ya estaba pagada (p.ej. pago con billetes falsos), se invalida el pago y
  // se le revocan los puntos al cliente. Por defecto false (no se pierden puntos).
  private async isRevokePointsOnCancelEnabled(): Promise<boolean> {
    const s = await this.prisma.setting.findUnique({
      where: { metaKey: 'advanced_revoke_points_on_cancel' },
      select: { metaValue: true },
    });
    return s?.metaValue === 'true';
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const current = await this.findOne(id); // 404 si no existe; trae items + status

    const { items, ...orderData } = updateOrderDto;
    const costByProduct = items
      ? await this.costByProductMap(items.map((i) => i.productId))
      : new Map<string, Prisma.Decimal | null>();
    const nextStatus = orderData.status as OrderStatus | undefined;
    const isCancelling =
      nextStatus === OrderStatus.CANCELLED && current.status !== OrderStatus.CANCELLED;
    const isCompleting =
      nextStatus === OrderStatus.COMPLETED && current.status !== OrderStatus.COMPLETED;
    // Sólo consultamos el switch cuando realmente estamos cancelando.
    const revokeOnCancel = isCancelling ? await this.isRevokePointsOnCancelEnabled() : false;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Reponer stock al CANCELAR (transición hacia CANCELLED desde cualquier
      // otro estado). Se exige que el estado previo NO fuera ya CANCELLED, por lo
      // que un re-PATCH a CANCELLED no repone dos veces. (Nota: reabrir un pedido
      // CANCELLED→PENDING no vuelve a descontar stock; evita ese toggle.)
      if (isCancelling) {
        for (const item of current.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }

        // Si el switch está activo: el pago cobrado se marca INVÁLIDO (FAILED) —
        // p.ej. pagó con billetes falsos. Sólo afecta pagos que estaban COMPLETED.
        // (Los puntos se revocan tras el commit, abajo.)
        if (revokeOnCancel) {
          await tx.payment.updateMany({
            where: { orderId: id, status: 'COMPLETED' },
            data: { status: 'FAILED' },
          });
        }
      }

      // Al COMPLETAR: el/los pago(s) asociados pasan a COMPLETED automáticamente.
      // Una orden entregada implica que se cobró (p.ej. efectivo contra entrega):
      // no tiene sentido que el pago quede "no pagado". Sólo afecta pagos aún no
      // COMPLETED. Esto es además lo que dispara la acreditación de puntos abajo.
      if (isCompleting) {
        await tx.payment.updateMany({
          where: { orderId: id, status: { not: 'COMPLETED' } },
          data: { status: 'COMPLETED', confirmedAt: new Date() },
        });
      }

      return tx.order.update({
        where: { id },
        data: {
          ...orderData,
          // Sella el momento de completado (para expirar el seguimiento público).
          ...(isCompleting ? { completedAt: new Date() } : {}),
          items: items
            ? {
                deleteMany: {},
                create: items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  price: item.price,
                  costSnapshot: costByProduct.get(item.productId) ?? null,
                })),
              }
            : undefined,
        },
        include: this.orderInclude,
      });
    });

    // Al COMPLETAR (su pago ya quedó COMPLETED arriba), acreditar los puntos al
    // cliente (idempotente, best-effort). Sólo en la transición real a COMPLETED.
    if (isCompleting) {
      await this.loyalty.awardForOrder(id);
    }

    // Al CANCELAR con el switch activo: revocar los puntos que ganó por la orden
    // (idempotente: sólo descuenta si estaban acreditados).
    if (isCancelling && revokeOnCancel) {
      await this.loyalty.revokeForOrder(id);
    }

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.order.delete({
      where: { id },
    });
  }

  async getAnalytics(dto: OrderAnalyticsQueryDto) {
    const now = new Date().getFullYear();
    const { period, year = now, yearFrom = 2020, yearTo = now } = dto;

    const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const sum = (rows: { total: Prisma.Decimal }[]) =>
      rows.reduce((acc, r) => acc + parseFloat(r.total.toString()), 0);

    // Diario: ingresos día a día de un mes concreto del año seleccionado.
    if (period === AnalyticsPeriod.DAILY) {
      const monthIdx = (dto.month ?? new Date().getMonth() + 1) - 1; // 0-indexed
      const start = new Date(year, monthIdx, 1);
      const end = new Date(year, monthIdx + 1, 0, 23, 59, 59); // último día del mes
      const daysInMonth = end.getDate();

      const orders = await this.prisma.order.findMany({
        where: {
          status: { not: OrderStatus.CANCELLED },
          createdAt: { gte: start, lte: end },
        },
        select: { createdAt: true, total: true },
      });

      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const rows = orders.filter((o) => o.createdAt.getDate() === day);
        return {
          label: String(day).padStart(2, '0'),
          ventas: rows.length,
          ingresos: sum(rows),
        };
      });
    }

    if (period === AnalyticsPeriod.ANNUAL) {
      const orders = await this.prisma.order.findMany({
        where: {
          status: { not: OrderStatus.CANCELLED },
          createdAt: {
            gte: new Date(yearFrom, 0, 1),
            lte: new Date(yearTo, 11, 31, 23, 59, 59),
          },
        },
        select: { createdAt: true, total: true },
      });

      return Array.from({ length: yearTo - yearFrom + 1 }, (_, i) => {
        const y = yearFrom + i;
        const rows = orders.filter((o) => o.createdAt.getFullYear() === y);
        return { label: String(y), ventas: rows.length, ingresos: sum(rows) };
      });
    }

    const orders = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELLED },
        createdAt: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59),
        },
      },
      select: { createdAt: true, total: true },
    });

    if (period === AnalyticsPeriod.MONTHLY) {
      return MONTHS.map((label, i) => {
        const rows = orders.filter((o) => o.createdAt.getMonth() === i);
        return { label, ventas: rows.length, ingresos: sum(rows) };
      });
    }

    if (period === AnalyticsPeriod.QUARTERLY) {
      return [0, 1, 2, 3].map((q) => {
        const rows = orders.filter((o) => Math.floor(o.createdAt.getMonth() / 3) === q);
        return { label: `Q${q + 1}`, ventas: rows.length, ingresos: sum(rows) };
      });
    }

    // SEMIANNUAL
    return [0, 1].map((h) => {
      const rows = orders.filter((o) => (o.createdAt.getMonth() < 6 ? 0 : 1) === h);
      return { label: `H${h + 1}`, ventas: rows.length, ingresos: sum(rows) };
    });
  }

  // ── Finanzas (margen bruto) ────────────────────────────────────────────────
  // Ingresos = order.total (ya neto del descuento de cupón). COGS = Σ(costSnapshot×qty)
  // sobre items con costSnapshot != null; los items históricos sin costo se EXCLUYEN
  // del COGS (su utilidad quedaría inflada). Utilidad = ingresos − COGS.
  // Reusa el mismo bucketing por período que getAnalytics.
  async getFinanceAnalytics(dto: OrderAnalyticsQueryDto) {
    const now = new Date().getFullYear();
    const { period, year = now, yearFrom = 2020, yearTo = now } = dto;

    const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    type FinanceRow = {
      createdAt: Date;
      total: Prisma.Decimal;
      items: { quantity: number; costSnapshot: Prisma.Decimal | null }[];
    };
    const num = (d: Prisma.Decimal | null) => (d ? parseFloat(d.toString()) : 0);
    const cogsOf = (rows: FinanceRow[]) =>
      rows.reduce(
        (acc, r) =>
          acc +
          r.items.reduce(
            (s, it) => s + (it.costSnapshot ? num(it.costSnapshot) * it.quantity : 0),
            0,
          ),
        0,
      );
    const point = (label: string, rows: FinanceRow[]) => {
      const ingresos = rows.reduce((a, r) => a + num(r.total), 0);
      const costos = cogsOf(rows);
      const utilidad = ingresos - costos;
      const margen = ingresos > 0 ? (utilidad / ingresos) * 100 : 0;
      return { label, ingresos, costos, utilidad, margen };
    };

    const fetchRows = (gte: Date, lte: Date): Promise<FinanceRow[]> =>
      this.prisma.order.findMany({
        where: { status: { not: OrderStatus.CANCELLED }, createdAt: { gte, lte } },
        select: {
          createdAt: true,
          total: true,
          items: { select: { quantity: true, costSnapshot: true } },
        },
      });

    if (period === AnalyticsPeriod.DAILY) {
      const monthIdx = (dto.month ?? new Date().getMonth() + 1) - 1;
      const start = new Date(year, monthIdx, 1);
      const end = new Date(year, monthIdx + 1, 0, 23, 59, 59);
      const rows = await fetchRows(start, end);
      return Array.from({ length: end.getDate() }, (_, i) => {
        const day = i + 1;
        return point(String(day).padStart(2, '0'), rows.filter((o) => o.createdAt.getDate() === day));
      });
    }

    if (period === AnalyticsPeriod.ANNUAL) {
      const rows = await fetchRows(new Date(yearFrom, 0, 1), new Date(yearTo, 11, 31, 23, 59, 59));
      return Array.from({ length: yearTo - yearFrom + 1 }, (_, i) => {
        const y = yearFrom + i;
        return point(String(y), rows.filter((o) => o.createdAt.getFullYear() === y));
      });
    }

    const rows = await fetchRows(new Date(year, 0, 1), new Date(year, 11, 31, 23, 59, 59));

    if (period === AnalyticsPeriod.MONTHLY) {
      return MONTHS.map((label, i) => point(label, rows.filter((o) => o.createdAt.getMonth() === i)));
    }
    if (period === AnalyticsPeriod.QUARTERLY) {
      return [0, 1, 2, 3].map((q) =>
        point(`Q${q + 1}`, rows.filter((o) => Math.floor(o.createdAt.getMonth() / 3) === q)),
      );
    }
    // SEMIANNUAL
    return [0, 1].map((h) =>
      point(`H${h + 1}`, rows.filter((o) => (o.createdAt.getMonth() < 6 ? 0 : 1) === h)),
    );
  }

  // Rentabilidad por producto en un rango de fechas. El descuento de cupón (a nivel
  // orden) se reparte PROPORCIONALMENTE entre los items según su participación en el
  // ingreso de la orden (aproximación documentada; no atribuye cupones restringidos a
  // productos con exactitud). Items con costSnapshot null se excluyen del COGS y marcan
  // `hasMissingCost` para no inflar el margen silenciosamente.
  async getProductProfitability(query: ProductProfitabilityQueryDto) {
    const createdAt =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo
              ? { lte: new Date(new Date(query.dateTo).setHours(23, 59, 59, 999)) }
              : {}),
          }
        : undefined;

    const items = await this.prisma.orderItem.findMany({
      where: {
        order: { status: { not: OrderStatus.CANCELLED }, ...(createdAt ? { createdAt } : {}) },
      },
      select: {
        productId: true,
        quantity: true,
        price: true,
        costSnapshot: true,
        product: { select: { name: true } },
        order: { select: { id: true, discount: true } },
      },
    });

    const n = (d: Prisma.Decimal | null) => (d ? parseFloat(d.toString()) : 0);

    // 1) Subtotal por orden para repartir su descuento proporcionalmente.
    const orderSubtotal = new Map<string, number>();
    for (const it of items) {
      const line = n(it.price) * it.quantity;
      orderSubtotal.set(it.order.id, (orderSubtotal.get(it.order.id) ?? 0) + line);
    }

    // 2) Agregación por producto.
    type Agg = {
      productId: string;
      name: string;
      qtySold: number;
      ingresos: number;
      costos: number;
      hasMissingCost: boolean;
    };
    const byProduct = new Map<string, Agg>();
    for (const it of items) {
      const qty = it.quantity;
      const line = n(it.price) * qty;
      const sub = orderSubtotal.get(it.order.id) ?? 0;
      const allocatedDiscount = sub > 0 ? n(it.order.discount) * (line / sub) : 0;
      const netRevenue = line - allocatedDiscount;
      const hasCost = it.costSnapshot != null;
      const lineCost = hasCost ? n(it.costSnapshot) * qty : 0;

      const cur =
        byProduct.get(it.productId) ??
        ({
          productId: it.productId,
          name: it.product?.name ?? '—',
          qtySold: 0,
          ingresos: 0,
          costos: 0,
          hasMissingCost: false,
        } as Agg);
      cur.qtySold += qty;
      cur.ingresos += netRevenue;
      cur.costos += lineCost;
      cur.hasMissingCost = cur.hasMissingCost || !hasCost;
      byProduct.set(it.productId, cur);
    }

    const rows = [...byProduct.values()]
      .map((r) => {
        const utilidad = r.ingresos - r.costos;
        const margen = r.ingresos > 0 ? (utilidad / r.ingresos) * 100 : 0;
        const markup = r.costos > 0 ? (utilidad / r.costos) * 100 : null;
        return { ...r, utilidad, margen, markup };
      })
      .sort((a, b) => b.utilidad - a.utilidad);

    return query.limit ? rows.slice(0, query.limit) : rows;
  }
}
