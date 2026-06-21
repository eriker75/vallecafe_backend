import { Injectable } from '@nestjs/common';
import { NotificationAudience, Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

// Antigüedad máxima (días) para considerar a un usuario "nuevo".
const NEW_USER_WINDOW_DAYS = 30;

/**
 * Almacén de tokens push (Expo) por dispositivo. Equivale a la tabla
 * `nowful_user_fcm_tokens` del proyecto Nowful. Además traduce las audiencias
 * del panel de notificaciones (ALL_USERS, NEW_USERS, …) a la lista concreta de
 * tokens a los que hay que enviar.
 */
@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Gestión desde la app móvil ─────────────────────────────────────────────

  // Alta/actualización idempotente del token de un dispositivo. Upsert por
  // `token`: un dispositivo => una fila. Si el token ya pertenecía a otra cuenta
  // (mismo aparato, nuevo login) se reasigna al usuario actual.
  register(userId: string, dto: RegisterPushTokenDto) {
    return this.prisma.pushToken.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        deviceName: dto.deviceName,
        enabled: dto.enabled ?? true,
      },
      update: {
        userId,
        platform: dto.platform,
        deviceName: dto.deviceName,
        // Si no se envía `enabled`, no se toca la preferencia previa del usuario
        // (re-registrar al abrir la app no debe re-activar un token silenciado).
        enabled: dto.enabled,
        lastUsedAt: new Date(),
      },
    });
  }

  // Dispositivos registrados del usuario (para una pantalla de ajustes).
  listForUser(userId: string) {
    return this.prisma.pushToken.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        platform: true,
        deviceName: true,
        enabled: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  // Silencia/activa un dispositivo concreto sin borrar el token. Acotado al dueño.
  async setEnabled(userId: string, token: string, enabled: boolean) {
    const { count } = await this.prisma.pushToken.updateMany({
      where: { token, userId },
      data: { enabled },
    });
    return { updated: count };
  }

  // Baja del token (p.ej. al cerrar sesión). Acotado al dueño.
  async unregister(userId: string, token: string) {
    const { count } = await this.prisma.pushToken.deleteMany({
      where: { token, userId },
    });
    return { deleted: count };
  }

  // ── Uso interno al enviar ──────────────────────────────────────────────────

  // Tokens activos de un usuario (para avisos transaccionales / push de prueba).
  async getEnabledTokensForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: { userId, enabled: true },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  // Traduce una audiencia a la lista de USUARIOS destinatarios (activos, no
  // borrados). Incluye usuarios SIN push: el buzón in-app es para todos los
  // alcanzados, tengan o no dispositivos con notificaciones.
  async getUserIdsForAudience(
    audience: NotificationAudience,
  ): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'active',
        ...this.audienceWhere(audience),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // Tokens push activos de un conjunto de usuarios (el transporte del envío).
  async getEnabledTokensForUserIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.pushToken.findMany({
      where: { enabled: true, userId: { in: userIds } },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  // Traduce una audiencia directamente a tokens (usuarios → sus tokens activos).
  async getTokensForAudience(
    audience: NotificationAudience,
  ): Promise<string[]> {
    const userIds = await this.getUserIdsForAudience(audience);
    return this.getEnabledTokensForUserIds(userIds);
  }

  // Limpia tokens que Expo reportó como muertos (DeviceNotRegistered): ese string
  // no volverá a ser válido, así que se borra para no reintentar.
  async removeInvalidTokens(tokens: string[]) {
    if (tokens.length === 0) return { deleted: 0 };
    const { count } = await this.prisma.pushToken.deleteMany({
      where: { token: { in: tokens } },
    });
    return { deleted: count };
  }

  // ── Audiencias → filtro de usuario ─────────────────────────────────────────
  // Heurísticas pragmáticas sobre las relaciones existentes. Pensadas para
  // refinarse a futuro sin tocar el resto del flujo.
  private audienceWhere(audience: NotificationAudience): Prisma.UserWhereInput {
    switch (audience) {
      case NotificationAudience.NEW_USERS: {
        const since = new Date();
        since.setDate(since.getDate() - NEW_USER_WINDOW_DAYS);
        return { createdAt: { gte: since } };
      }
      // VIP: clientes que ya completaron al menos una compra.
      case NotificationAudience.VIP:
        return { orders: { some: { status: 'COMPLETED' } } };
      // Por tipo de cuenta (mayorista / minorista).
      case NotificationAudience.WHOLESALE_B2B:
        return { accountType: 'B2B' };
      case NotificationAudience.RETAIL_B2C:
        return { accountType: 'B2C' };
      // INACTIVE: registrados que nunca han pedido.
      case NotificationAudience.INACTIVE:
        return { orders: { none: {} } };
      // CART_ABANDONMENT: tienen carrito con productos dentro.
      case NotificationAudience.CART_ABANDONMENT:
        return { cart: { items: { some: {} } } };
      // NEWSLETTER: suscritos al boletín desde la web.
      case NotificationAudience.NEWSLETTER:
        return { contacts: { some: { fromNewsletter: true } } };
      case NotificationAudience.ALL_USERS:
      default:
        return {};
    }
  }
}
