import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { buildOrderBy } from '../common/sort/build-order-by';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { BulkImportDto } from '../common/dto/bulk-import.dto';
import {
  runBulkImport,
  validateAgainstDto,
  type BulkResult,
} from '../common/bulk/bulk-import.helper';
import { compactRow } from '../common/bulk/compact-row';
import { ExpoPushService, PushPayload } from './push/expo-push.service';
import { PushTokensService } from './push-tokens.service';

// Columnas ordenables desde la tabla de notificaciones del admin (cabeceras clickeables).
const NOTIFICATION_SORT_COLUMNS: Record<
  string,
  (dir: Prisma.SortOrder) => Prisma.NotificationOrderByWithRelationInput
> = {
  title: (dir) => ({ title: dir }),
  audience: (dir) => ({ audience: dir }),
  status: (dir) => ({ status: dir }),
  scheduledAt: (dir) => ({ scheduledAt: dir }),
  sentAt: (dir) => ({ sentAt: dir }),
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
    private readonly pushTokens: PushTokensService,
  ) {}

  create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        title: dto.title,
        message: dto.message,
        audience: dto.audience,
        status: dto.status,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
  }

  async findAll({ limit, offset, sortBy, order }: PaginationDto) {
    const orderBy = buildOrderBy(sortBy, order, NOTIFICATION_SORT_COLUMNS, {
      createdAt: 'desc',
    });

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        orderBy,
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count(),
    ]);
    return { data, total, limit, offset };
  }

  async findOne(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification)
      throw new NotFoundException(`Notification ${id} not found`);
    return notification;
  }

  async update(id: string, dto: UpdateNotificationDto) {
    await this.findOne(id);
    return this.prisma.notification.update({
      where: { id },
      data: {
        title: dto.title,
        message: dto.message,
        audience: dto.audience,
        status: dto.status,
        scheduledAt:
          dto.scheduledAt !== undefined
            ? dto.scheduledAt
              ? new Date(dto.scheduledAt)
              : null
            : undefined,
      },
    });
  }

  // Despacha la notificación ahora:
  //   1) resuelve la audiencia → USUARIOS destinatarios,
  //   2) materializa la entrega: una fila en notification_recipients por usuario
  //      (idempotente; reenviar no duplica). Esto es el buzón in-app.
  //   3) empuja push (Expo) a los dispositivos de esos usuarios (transporte),
  //   4) marca la campaña como SENT con el alcance (nº de usuarios).
  async sendNow(id: string) {
    const notification = await this.findOne(id);

    const userIds = await this.pushTokens.getUserIdsForAudience(
      notification.audience,
    );

    // Entrega al buzón de cada usuario alcanzado (no duplica si ya existía).
    if (userIds.length > 0) {
      await this.prisma.notificationRecipient.createMany({
        data: userIds.map((userId) => ({ notificationId: id, userId })),
        skipDuplicates: true,
      });
    }

    // Push a los dispositivos de esos usuarios (los que tengan tokens activos).
    const tokens = await this.pushTokens.getEnabledTokensForUserIds(userIds);
    await this.dispatch(tokens, {
      title: notification.title,
      body: notification.message,
      data: { type: 'campaign', notificationId: notification.id },
    });

    return this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        sentCount: userIds.length,
      },
    });
  }

  // ── Buzón por usuario (entradas de notification_recipients) ─────────────────

  // Notificaciones recibidas por el usuario (su buzón), paginadas. Aplana la
  // entrega + la campaña al shape que consume la app.
  async listForUser(userId: string, { limit, offset }: PaginationDto) {
    const [rows, total, unread] = await this.prisma.$transaction([
      this.prisma.notificationRecipient.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          read: true,
          readAt: true,
          createdAt: true,
          notification: { select: { id: true, title: true, message: true } },
        },
      }),
      this.prisma.notificationRecipient.count({ where: { userId } }),
      this.prisma.notificationRecipient.count({
        where: { userId, read: false },
      }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      notificationId: r.notification.id,
      title: r.notification.title,
      body: r.notification.message,
      read: r.read,
      readAt: r.readAt,
      createdAt: r.createdAt,
    }));
    return { data, total, unread, limit, offset };
  }

  async unreadCountForUser(userId: string) {
    const unread = await this.prisma.notificationRecipient.count({
      where: { userId, read: false },
    });
    return { unread };
  }

  // Marca una entrada del buzón como leída. Acotado al dueño (recipientId).
  async markReadForUser(userId: string, recipientId: string) {
    const { count } = await this.prisma.notificationRecipient.updateMany({
      where: { id: recipientId, userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { updated: count };
  }

  async markAllReadForUser(userId: string) {
    const { count } = await this.prisma.notificationRecipient.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { updated: count };
  }

  // Elimina una entrada del buzón del usuario (no borra la campaña). Acotado al
  // dueño por `userId`. Borra sólo su fila de notification_recipients.
  async removeForUser(userId: string, recipientId: string) {
    const { count } = await this.prisma.notificationRecipient.deleteMany({
      where: { id: recipientId, userId },
    });
    return { deleted: count };
  }

  // Push de prueba a los propios dispositivos del usuario autenticado.
  async sendTestToUser(
    userId: string,
    opts: { title?: string; body?: string } = {},
  ) {
    const tokens = await this.pushTokens.getEnabledTokensForUser(userId);
    const result = await this.dispatch(tokens, {
      title: opts.title ?? 'Notificación de prueba',
      body: opts.body ?? 'Tus notificaciones push están funcionando 🎉',
      data: { type: 'test' },
    });
    return { devices: tokens.length, ...result };
  }

  // Envío + limpieza de tokens inválidos. Compartido por campañas y avisos.
  private async dispatch(tokens: string[], payload: PushPayload) {
    if (tokens.length === 0) {
      return { sent: 0, invalidTokens: [], skippedTokens: [] };
    }
    const result = await this.expoPush.send(tokens, payload);
    await this.pushTokens.removeInvalidTokens(result.invalidTokens);
    return {
      sent: result.sent,
      invalidTokens: result.invalidTokens,
      skippedTokens: result.skippedTokens,
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.notification.delete({ where: { id } });
  }

  // Importación masiva desde CSV. Sin clave única natural: se resuelve duplicado
  // por `id` (si viene en el archivo) o por `title`.
  async bulkImport({ mode, rows }: BulkImportDto): Promise<BulkResult> {
    type NotificationRow = { dto: CreateNotificationDto; id?: string };

    return runBulkImport<NotificationRow>(rows, mode, {
      prepare: async (raw) => {
        const dto = await validateAgainstDto(
          CreateNotificationDto,
          compactRow({
            title: raw.title,
            message: raw.message,
            audience: raw.audience,
            status: raw.status,
            scheduledAt: raw.scheduledAt,
          }) as Record<string, unknown>,
        );
        const id =
          typeof raw.id === 'string' && raw.id.trim()
            ? raw.id.trim()
            : undefined;
        return { dto, id };
      },
      findExisting: ({ dto, id }) =>
        id
          ? this.prisma.notification.findUnique({ where: { id } })
          : this.prisma.notification.findFirst({ where: { title: dto.title } }),
      create: ({ dto }) => this.create(dto),
      update: (existing, { dto }) =>
        this.update((existing as { id: string }).id, dto),
    });
  }
}
