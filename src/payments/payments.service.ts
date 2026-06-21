import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.service';
import { buildOrderBy } from '../common/sort/build-order-by';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { QueryPaymentDto } from './dto/query-payment.dto';

// Columnas ordenables desde la tabla de pagos del admin (cabeceras clickeables).
const PAYMENT_SORT_COLUMNS: Record<
  string,
  (dir: Prisma.SortOrder) => Prisma.PaymentOrderByWithRelationInput
> = {
  method: (dir) => ({ method: dir }),
  status: (dir) => ({ status: dir }),
  amount: (dir) => ({ amount: dir }),
  reference: (dir) => ({ reference: dir }),
  payer: (dir) => ({ payerName: dir }),
  bank: (dir) => ({ bank: dir }),
  customer: (dir) => ({ order: { user: { email: dir } } }),
  createdAt: (dir) => ({ createdAt: dir }),
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  // Listado de pagos (admin) con filtro opcional por estado y paginación.
  async findAll({ limit, offset, status, method, bank, search, dateFrom, dateTo, sortBy, order }: QueryPaymentDto) {
    const where: Prisma.PaymentWhereInput = {};
    if (status) where.status = status;
    if (method) where.method = method;
    if (bank) where.bank = bank;
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { payerIdDocument: { contains: search, mode: 'insensitive' } },
        { payerPhone: { contains: search, mode: 'insensitive' } },
        { order: { user: { email: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    const orderBy = buildOrderBy(sortBy, order, PAYMENT_SORT_COLUMNS, {
      createdAt: 'desc',
    });

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              status: true,
              total: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
        orderBy,
        take: limit,
        skip: offset,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data, total, limit, offset };
  }

  // Confirmación manual (admin) / punto de entrada del webhook. Actualiza el
  // estado del PAGO. Si pasa a COMPLETED, marca confirmedAt y, si el pedido sigue
  // PENDING, lo avanza a PREPARING (pago cobrado → arranca la preparación). El
  // "pagado" vive en payments.status; los estados de la orden son de fulfillment.
  async updateStatus(id: string, status: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Pago ${id} no encontrado`);
    }

    // Atómico: o se aplican el pago + el avance de la orden, o ninguno.
    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.payment.update({
        where: { id },
        data: {
          status,
          ...(status === 'COMPLETED' ? { confirmedAt: new Date() } : {}),
        },
      });

      if (status === 'COMPLETED' && payment.orderId) {
        // Avanza la orden sólo si sigue PENDING (no la mueve hacia atrás si ya
        // está SENDING/COMPLETED). payment.orderId referencia Order.id (uuid).
        // Puede ser null en un abono huérfano aún sin orden vinculada.
        await tx.order.updateMany({
          where: { id: payment.orderId, status: 'PENDING' },
          data: { status: 'PREPARING' },
        });
      }

      return upd;
    });

    // Pago COMPLETED → acredita los puntos al cliente (idempotente, best-effort).
    if (status === 'COMPLETED' && payment.orderId) {
      await this.loyalty.awardForOrder(payment.orderId);
    }

    return updated;
  }
}
