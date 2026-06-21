import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '../database/database.service';

/**
 * Cliente del API R4 Conecta (Mi Banco) — Guía de Integración v3.0 (D-PYM-001).
 *
 * Autenticación (todos los métodos):
 *   - Header `Commerce`: el token del comercio que entrega el banco (R4_COMMERCE_ID).
 *   - Header `Authorization`: HMAC-SHA256 en HEX de la concatenación de campos
 *     específica de cada método, usando R4_COMMERCE_ID como llave. Sin "Bearer".
 *
 * Concatenaciones por método (orden EXACTO de la guía, sin separadores):
 *   - GenerarOtp:           Banco + Monto + Telefono + Cedula
 *   - DebitoInmediato:      Banco + Cedula + Telefono + Monto + OTP
 *   - ConsultarOperaciones: Id
 *   - MBbcv (tasa BCV):     Fechavalor + Moneda
 */

export interface R4GenerarOtpInput {
  banco: string; // 4 dígitos, ej. "0169"
  monto: string; // "1234.56" (Bs, punto decimal)
  telefono: string; // 11 dígitos, ej. "04245555555"
  cedula: string; // V/E/J/P + número, ej. "V12345678"
}

export interface R4DebitoInput extends R4GenerarOtpInput {
  nombre: string; // máx 20 caracteres
  otp: string; // OTP que el banco envió al cliente
  concepto?: string; // máx 30 caracteres
}

export interface R4Respuesta {
  code?: string;
  message?: string;
  reference?: string;
  id?: string;
  Id?: string; // R4 alterna mayúscula/minúscula según el code
  success?: boolean;
  [key: string]: unknown;
}

/** Datos de la cuenta receptora del comercio para pago móvil / C2P. */
export interface CuentaDestino {
  bank: string;
  phone: string;
  rif: string;
}

// metaKeys del grupo PAYMENT en settings (prioridad sobre las env vars)
const SETTING_KEYS = {
  bank: 'payment_pago_movil_bank',
  phone: 'payment_pago_movil_phone',
  rif: 'payment_pago_movil_rif',
} as const;

@Injectable()
export class R4ConectaService {
  private readonly logger = new Logger(R4ConectaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get baseUrl(): string {
    return (
      this.config.get<string>('R4_BASE_URL') ??
      'https://r4conecta.mibanco.com.ve'
    ).replace(/\/+$/, '');
  }

  private get commerceId(): string {
    return this.config.get<string>('R4_COMMERCE_ID') ?? '';
  }

  /**
   * true si el token Commerce está configurado (sin él no se puede firmar).
   * Los tokens reales del banco son hashes largos (≥32 chars); el umbral
   * descarta vacíos y placeholders tipo "pendiente-token-del-banco".
   */
  isConfigured(): boolean {
    return this.commerceId.trim().length >= 32;
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.commerceId).update(data).digest('hex');
  }

  private async post<T extends R4Respuesta>(
    path: string,
    signatureData: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Pagos R4 no disponibles: falta configurar R4_COMMERCE_ID',
      );
    }

    const url = `${this.baseUrl}/${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.hmac(signatureData),
        Commerce: this.commerceId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    const data = (await res.json().catch(() => ({}))) as T;
    // R4 responde 200 incluso en rechazos (el estado va en `code`); un status
    // HTTP != 200 es un problema de transporte/credenciales, no de negocio.
    if (!res.ok) {
      this.logger.error(
        `R4 ${path} → HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`,
      );
      throw new ServiceUnavailableException(
        `El banco no pudo procesar la solicitud (HTTP ${res.status})`,
      );
    }
    this.logger.log(`R4 ${path} → code=${data.code ?? '??'}`);
    return data;
  }

  /** Paso 1 del débito inmediato: el banco envía el OTP al cliente. */
  generarOtp(i: R4GenerarOtpInput): Promise<R4Respuesta> {
    return this.post(
      'GenerarOtp',
      `${i.banco}${i.monto}${i.telefono}${i.cedula}`,
      { Banco: i.banco, Monto: i.monto, Telefono: i.telefono, Cedula: i.cedula },
    );
  }

  /** Paso 2: ejecuta el débito con el OTP. ACCP=aprobado, AC00=en espera. */
  debitoInmediato(i: R4DebitoInput): Promise<R4Respuesta> {
    return this.post(
      'DebitoInmediato',
      `${i.banco}${i.cedula}${i.telefono}${i.monto}${i.otp}`,
      {
        Banco: i.banco,
        Monto: i.monto,
        Telefono: i.telefono,
        Cedula: i.cedula,
        Nombre: i.nombre.slice(0, 20),
        OTP: i.otp,
        ...(i.concepto ? { Concepto: i.concepto.slice(0, 30) } : {}),
      },
    );
  }

  /** Consulta el estado final de una operación que respondió AC00. */
  consultarOperacion(id: string): Promise<R4Respuesta> {
    return this.post('ConsultarOperaciones', id, { Id: id });
  }

  /** Tasa oficial BCV vía el banco (MBbcv). fechavalor: yyyy-mm-dd. */
  consultarTasaBcv(
    fechavalor: string,
    moneda = 'USD',
  ): Promise<R4Respuesta & { tipocambio?: number; fechavalor?: string }> {
    return this.post('MBbcv', `${fechavalor}${moneda}`, {
      Moneda: moneda,
      Fechavalor: fechavalor,
    });
  }

  /**
   * Cuenta receptora del comercio (a dónde paga el cliente el pago móvil).
   * Prioridad: settings del admin (grupo PAYMENT) → env R4_CUENTA_*.
   */
  async getCuentaDestino(): Promise<CuentaDestino> {
    const fromSettings: Partial<CuentaDestino> = {};
    try {
      const rows = await this.prisma.setting.findMany({
        where: { metaKey: { in: Object.values(SETTING_KEYS) } },
      });
      for (const row of rows) {
        const value = (row.metaValue ?? '').trim();
        if (!value) continue;
        if (row.metaKey === SETTING_KEYS.bank) fromSettings.bank = value;
        if (row.metaKey === SETTING_KEYS.phone) fromSettings.phone = value;
        if (row.metaKey === SETTING_KEYS.rif) fromSettings.rif = value;
      }
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer los settings de pago (uso env): ${(error as Error)?.message}`,
      );
    }

    return {
      bank:
        fromSettings.bank ?? this.config.get<string>('R4_CUENTA_BANCO') ?? '',
      phone:
        fromSettings.phone ??
        this.config.get<string>('R4_CUENTA_TELEFONO') ??
        '',
      rif:
        fromSettings.rif ?? this.config.get<string>('R4_CUENTA_CEDULA') ?? '',
    };
  }

  // ── Normalizadores de datos del pagador (formato que exige la guía) ──────────

  /** "27178492" → "V27178492"; respeta prefijos V/E/J/P existentes. */
  static normalizeCedula(raw: string): string {
    const clean = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return /^[VEJP]/.test(clean) ? clean : `V${clean}`;
  }

  /** "4245191996" → "04245191996" (11 dígitos empezando por 0). */
  static normalizeTelefono(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    return digits.length === 10 && !digits.startsWith('0')
      ? `0${digits}`
      : digits;
  }
}
