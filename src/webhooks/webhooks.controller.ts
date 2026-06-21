import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { R4WebhooksService } from './webhooks.service';
import { R4WebhookNotificaDto } from './dto/r4-webhook-notifica.dto';
import { R4WebhookConsultaDto } from './dto/r4-webhook-consulta.dto';
import { gcpLog } from '../common/gcp-logger';

// Webhooks de R4. Sin @Auth: R4 autentica por el header Authorization, que el
// servicio valida de forma NO bloqueante. Leemos el cuerpo crudo (@Req) para
// que el ValidationPipe global (whitelist + forbidNonWhitelisted) no descarte
// ni rechace los campos PascalCase que envía R4.
@ApiTags('R4 Webhooks')
@Controller('webhooks/r4')
export class WebhooksController {
  constructor(private readonly webhooksService: R4WebhooksService) {}

  // IP real del llamador detrás de Cloud Run: el frontend de Google AÑADE la IP
  // del cliente al final de X-Forwarded-For, así que el último valor es el
  // confiable (los anteriores los puede inventar el cliente).
  private sourceIp(req: Request): string | undefined {
    const xff = req.headers['x-forwarded-for'];
    const raw = Array.isArray(xff) ? xff.join(',') : xff;
    const last = raw?.split(',').pop()?.trim();
    return last || req.ip;
  }

  // Subconjunto seguro de cabeceras para el log. Nunca incluye `authorization`
  // (es el secreto compartido con R4): solo registramos si vino o no.
  private safeHeaders(req: Request): Record<string, unknown> {
    const h = req.headers;
    return {
      'content-type': h['content-type'],
      'user-agent': h['user-agent'],
      'x-forwarded-for': h['x-forwarded-for'],
      'x-real-ip': h['x-real-ip'],
      host: h['host'],
      authPresent: Boolean(h['authorization']),
    };
  }

  @Post('notifica')
  @ApiSecurity('r4-token')
  @ApiOperation({ summary: 'Notificación de abono (pago móvil) desde R4' })
  async notifica(@Req() req: Request) {
    const auth = req.headers['authorization'];
    const sourceIp = this.sourceIp(req);
    const body = req.body as R4WebhookNotificaDto;
    // Log de ENTRADA antes de validar: así queda registro incluso de las
    // peticiones que luego rechazamos con 401 (token/IP inválidos). Aquí se ve
    // exactamente qué clave manda R4 como identificador (Referencia) y todo el
    // body crudo.
    gcpLog('INFO', 'r4.webhook.notifica.in', {
      phase: 'notifica',
      sourceIp,
      reference: body?.Referencia ?? null,
      headers: this.safeHeaders(req),
      body,
    });
    try {
      const result = await this.webhooksService.handleNotifica(
        body,
        auth,
        sourceIp,
      );
      gcpLog('INFO', 'r4.webhook.notifica.out', {
        phase: 'notifica',
        sourceIp,
        reference: body?.Referencia ?? null,
        result,
      });
      return result;
    } catch (err) {
      gcpLog('WARNING', 'r4.webhook.notifica.rejected', {
        phase: 'notifica',
        sourceIp,
        reference: body?.Referencia ?? null,
        error: (err as Error)?.message ?? String(err),
      });
      throw err;
    }
  }

  @Post('consulta')
  @ApiSecurity('r4-token')
  @ApiOperation({ summary: 'Consulta de disponibilidad desde R4' })
  async consulta(@Req() req: Request) {
    const auth = req.headers['authorization'];
    const sourceIp = this.sourceIp(req);
    const body = req.body as R4WebhookConsultaDto;
    gcpLog('INFO', 'r4.webhook.consulta.in', {
      phase: 'consulta',
      sourceIp,
      // En la consulta R4 manda IdCliente como clave de la operación.
      idCliente: body?.IdCliente ?? null,
      headers: this.safeHeaders(req),
      body,
    });
    try {
      const result = await this.webhooksService.handleConsulta(
        body,
        auth,
        sourceIp,
      );
      gcpLog('INFO', 'r4.webhook.consulta.out', {
        phase: 'consulta',
        sourceIp,
        idCliente: body?.IdCliente ?? null,
        result,
      });
      return result;
    } catch (err) {
      gcpLog('WARNING', 'r4.webhook.consulta.rejected', {
        phase: 'consulta',
        sourceIp,
        idCliente: body?.IdCliente ?? null,
        error: (err as Error)?.message ?? String(err),
      });
      throw err;
    }
  }
}
