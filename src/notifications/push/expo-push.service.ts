import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

// Carga útil de un envío push (lo que ve el usuario + datos para el deep-link).
export interface PushPayload {
  title: string;
  body: string;
  // Datos opacos que la app recibe en la notificación (p.ej. { type, orderId }).
  // La app móvil los usa para navegar al pulsar (ver PushNotificationProvider).
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
}

export interface PushSendResult {
  // Nº de mensajes que Expo aceptó (ticket status 'ok').
  sent: number;
  // Tokens que Expo rechazó por estar dados de baja (DeviceNotRegistered).
  // El llamador debe deshabilitarlos/borrarlos para no reintentar en vano.
  invalidTokens: string[];
  // Tokens que ni siquiera tienen el formato de un Expo push token.
  skippedTokens: string[];
  tickets: ExpoPushTicket[];
}

/**
 * Envoltorio sobre `expo-server-sdk`. Inspirado en el proyecto de referencia
 * `expo-push-server` (NestJS), pero endurecido para producción:
 *   · espera (await) cada chunk en lugar de empujar promesas sin resolver,
 *   · alinea los tickets con sus tokens para detectar `DeviceNotRegistered`,
 *   · no lanza si un token es inválido: lo reporta para que se limpie.
 *
 * Es un proveedor "puro": no toca la base de datos. La limpieza de tokens
 * inválidos la hace quien lo invoca (PushTokensService).
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);
  private readonly expo: Expo;

  constructor(config: ConfigService) {
    this.expo = new Expo({
      // Opcional: refuerza el rate-limit de Expo si se define en el entorno.
      accessToken: config.get<string>('EXPO_ACCESS_TOKEN'),
      useFcmV1: true,
    });
  }

  /** ¿El string tiene forma de "ExponentPushToken[…]" / "ExpoPushToken[…]"? */
  static isExpoPushToken(token: string): boolean {
    return Expo.isExpoPushToken(token);
  }

  /**
   * Envía la misma carga útil a una lista de tokens. Hace chunking automático
   * (Expo limita el tamaño de cada lote) y devuelve un resumen con los tokens
   * inválidos para que el llamador los desactive.
   */
  async send(tokens: string[], payload: PushPayload): Promise<PushSendResult> {
    const skippedTokens: string[] = [];
    const validTokens: string[] = [];

    for (const token of tokens) {
      if (Expo.isExpoPushToken(token)) validTokens.push(token);
      else skippedTokens.push(token);
    }

    if (validTokens.length === 0) {
      return { sent: 0, invalidTokens: [], skippedTokens, tickets: [] };
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: payload.sound === undefined ? 'default' : payload.sound,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      badge: payload.badge,
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    // Mantenemos el token alineado con su ticket (mismo orden que `messages`).
    const orderedTokens: string[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        orderedTokens.push(...chunk.map((m) => m.to as string));
      } catch (error) {
        // Un chunk que falla no debe tumbar el resto del envío.
        this.logger.error(
          `Error enviando un chunk de push (${chunk.length} mensajes)`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    const invalidTokens: string[] = [];
    let sent = 0;

    tickets.forEach((ticket, i) => {
      if (ticket.status === 'ok') {
        sent += 1;
        return;
      }
      // ticket.status === 'error'
      const reason = ticket.details?.error;
      const token = orderedTokens[i];
      if (reason === 'DeviceNotRegistered' && token) {
        invalidTokens.push(token);
      }
      this.logger.warn(
        `Push rechazado (${reason ?? 'desconocido'}): ${ticket.message}`,
      );
    });

    return { sent, invalidTokens, skippedTokens, tickets };
  }
}
