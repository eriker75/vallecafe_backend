import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { R4ConectaService } from '../r4/r4-conecta.service';

// Tasa por defecto si todavía no hay ninguna fila en bcv_rates.
const DEFAULT_RATE = 40;

// Endpoint público gratuito de tasas (USD base). Leemos rates.VES.
const EXCHANGE_RATE_URL = 'https://open.er-api.com/v6/latest/USD';

@Injectable()
export class BcvService {
  private readonly logger = new Logger(BcvService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r4: R4ConectaService,
  ) {}

  // Tasa vigente = última fila insertada. null si todavía no hay ninguna.
  async getCurrentRate(): Promise<{ rate: number; source: string; updatedAt: Date } | null> {
    try {
      const latest = await this.prisma.bcvRate.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) return null;
      return {
        rate: Number(latest.rate),
        source: latest.source,
        updatedAt: latest.createdAt,
      };
    } catch (error) {
      // p.ej. la tabla `bcv_rates` aún no existe (migración pendiente). No debe
      // romper el checkout ni el GET público: caemos a "sin tasa" (→ default).
      this.logger.warn(
        `No se pudo leer la tasa BCV (¿migración pendiente?): ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  // Valor numérico de la tasa para el checkout. Si no hay ninguna, cae a un
  // valor por defecto sensato (y deja un warning en logs).
  async getRateValue(): Promise<number> {
    const current = await this.getCurrentRate();
    if (current) return current.rate;
    this.logger.warn(
      `No hay tasa BCV registrada; usando valor por defecto ${DEFAULT_RATE}`,
    );
    return DEFAULT_RATE;
  }

  // Fecha de hoy (yyyy-mm-dd) en la zona horaria de la tienda, que es la que
  // espera el campo Fechavalor del método MBbcv de R4.
  private todayInCaracas(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: process.env.TZ || 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  // Refresca la tasa. Orden de preferencia:
  //   1) R4 Conecta (MBbcv) — tasa OFICIAL BCV vía el banco (si hay credenciales).
  //   2) open.er-api.com — proveedor público gratuito (aproximación de mercado).
  //   3) Tasa almacenada (sin insertar), marcada como STORED.
  async refresh(): Promise<{ rate: number; source: string }> {
    if (this.r4.isConfigured()) {
      try {
        const res = await this.r4.consultarTasaBcv(this.todayInCaracas());
        const tipocambio = Number(res?.tipocambio);
        if (res?.code === '00' && Number.isFinite(tipocambio) && tipocambio > 0) {
          const created = await this.prisma.bcvRate.create({
            data: { rate: new Prisma.Decimal(tipocambio), source: 'R4' },
          });
          return { rate: Number(created.rate), source: created.source };
        }
        this.logger.warn(
          `R4 MBbcv sin tasa válida (code=${res?.code}); caigo al proveedor público`,
        );
      } catch (error) {
        this.logger.warn(
          `Fallo consultando tasa BCV vía R4: ${(error as Error)?.message ?? error}`,
        );
      }
    }

    try {
      const res = await fetch(EXCHANGE_RATE_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      const ves = Number(data?.rates?.VES);

      if (Number.isFinite(ves) && ves > 0) {
        const created = await this.prisma.bcvRate.create({
          data: {
            rate: new Prisma.Decimal(ves),
            source: 'EXCHANGERATE_API',
          },
        });
        return { rate: Number(created.rate), source: created.source };
      }

      this.logger.warn('Respuesta de tasa inválida (rates.VES ausente o <= 0)');
    } catch (error) {
      this.logger.error(
        `Fallo al refrescar la tasa BCV: ${(error as Error)?.message ?? error}`,
      );
    }

    // Fallback: tasa almacenada (no se inserta nada).
    const rate = await this.getRateValue();
    return { rate, source: 'STORED' };
  }

  // Establece una tasa manual (admin). Inserta una fila MANUAL.
  async setManual(rate: number, note?: string) {
    const created = await this.prisma.bcvRate.create({
      data: {
        rate: new Prisma.Decimal(rate),
        source: 'MANUAL',
        note: note ?? null,
      },
    });
    return { rate: Number(created.rate), source: created.source, note: created.note };
  }

  // Historial paginado, del más reciente al más antiguo.
  async getHistory({ limit, offset }: PaginationDto) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bcvRate.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.bcvRate.count(),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      rate: Number(r.rate),
      source: r.source,
      note: r.note,
      createdAt: r.createdAt,
    }));
    return { data, total, limit, offset };
  }
}
