import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/database.service';

// Clave bajo la que se guarda el saldo de puntos en `user_settings`.
export const LOYALTY_POINTS_KEY = 'loyalty_points';
// Grupo al que pertenece este setting (agrupa lo relacionado a fidelidad).
export const LOYALTY_GROUP = 'loyalty';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Lee el saldo de puntos acumulados de un usuario (0 si no tiene fila).
  async getBalance(userId: string): Promise<number> {
    const row = await this.prisma.userSetting.findUnique({
      where: { userId_metaKey: { userId, metaKey: LOYALTY_POINTS_KEY } },
      select: { metaValue: true },
    });
    if (!row) return 0;
    const n = parseInt(row.metaValue, 10);
    return Number.isFinite(n) ? n : 0;
  }

  // Acredita al saldo del usuario los puntos congelados del pedido. Se invoca
  // cuando el PAGO del pedido queda COMPLETED (webhook R4, confirmación manual del
  // admin, o al marcar la orden COMPLETED, que completa su pago). Es:
  //   · IDEMPOTENTE  → el flip de `pointsAwarded` (updateMany con guarda) sólo
  //                    afecta una vez aunque R4 reintente o el admin re-confirme.
  //                    El gatillo es el pago COMPLETED (lo garantizan los llamadores).
  //   · NO sobre CANCELADOS → un abono R4 tardío o una confirmación manual sobre
  //                    una orden ya CANCELLED NO acredita puntos (guard status).
  //   · ATÓMICO      → el UPSERT incrementa con CAST(...AS INTEGER) en SQL, así
  //                    dos pedidos del mismo usuario confirmados a la vez no se
  //                    pisan el saldo aunque `metaValue` sea texto.
  // Todo ocurre dentro de una transacción: si el incremento falla, el flip se
  // revierte y el pedido queda re-acreditable.
  async awardForOrder(orderId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const flip = await tx.order.updateMany({
          where: { id: orderId, pointsAwarded: false, status: { not: 'CANCELLED' } },
          data: { pointsAwarded: true },
        });
        if (flip.count !== 1) return; // ya acreditado, o el pedido está CANCELLED

        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { userId: true, pointsEarned: true },
        });
        if (!order || order.pointsEarned <= 0) return;

        const id = randomUUID();
        await tx.$executeRaw`
          INSERT INTO user_settings (id, "userId", "metaKey", "metaValue", "metaGroup", "createdAt", "updatedAt")
          VALUES (${id}, ${order.userId}, ${LOYALTY_POINTS_KEY}, ${String(order.pointsEarned)}, ${LOYALTY_GROUP}, now(), now())
          ON CONFLICT ("userId", "metaKey")
          DO UPDATE SET
            "metaValue" = (CAST(user_settings."metaValue" AS INTEGER) + ${order.pointsEarned})::text,
            "metaGroup" = ${LOYALTY_GROUP},
            "updatedAt" = now()
        `;
        this.logger.log(`Acreditados ${order.pointsEarned} pts al usuario ${order.userId} (pedido ${orderId})`);
      });
    } catch (error) {
      // No debe romper la confirmación del pago: el dinero ya entró. Se registra
      // para revisión; el pedido queda con pointsAwarded=false y puede reintentarse.
      this.logger.error(
        `No se pudieron acreditar puntos del pedido ${orderId}: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  // Revoca (resta) del saldo del cliente los puntos que otorgó un pedido. Se usa
  // al CANCELAR una orden ya pagada cuando el admin activó el switch de "revocar
  // puntos de órdenes canceladas" (p.ej. pago con billetes falsos). Es:
  //   · IDEMPOTENTE → sólo descuenta si los puntos estaban acreditados
  //                   (pointsAwarded=true), y baja el flag a false en el mismo paso.
  //   · ATÓMICO/SEGURO → resta con GREATEST(0, ...) para no dejar saldo negativo.
  async revokeForOrder(orderId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const flip = await tx.order.updateMany({
          where: { id: orderId, pointsAwarded: true },
          data: { pointsAwarded: false },
        });
        if (flip.count !== 1) return; // no había puntos acreditados que revocar

        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { userId: true, pointsEarned: true },
        });
        if (!order || order.pointsEarned <= 0) return;

        await tx.$executeRaw`
          UPDATE user_settings
          SET "metaValue" = GREATEST(0, CAST("metaValue" AS INTEGER) - ${order.pointsEarned})::text,
              "updatedAt" = now()
          WHERE "userId" = ${order.userId} AND "metaKey" = ${LOYALTY_POINTS_KEY}
        `;
        this.logger.log(
          `Revocados ${order.pointsEarned} pts del usuario ${order.userId} (pedido ${orderId} cancelado)`,
        );
      });
    } catch (error) {
      this.logger.error(
        `No se pudieron revocar puntos del pedido ${orderId}: ${(error as Error)?.message ?? error}`,
      );
    }
  }
}
