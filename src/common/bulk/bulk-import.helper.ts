import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

/**
 * Modos de importación masiva. El cliente elige uno en el group-button del modal:
 * - `create`: sólo inserta filas nuevas; las que ya existen se omiten.
 * - `update`: sólo actualiza filas existentes; las nuevas se omiten.
 * - `upsert`: crea las nuevas y actualiza las existentes.
 */
export type ImportMode = 'create' | 'update' | 'upsert';

export const IMPORT_MODES: ImportMode[] = ['create', 'update', 'upsert'];

export interface BulkRowError {
  /** Índice de la fila dentro del lote (0-based, sin contar el encabezado). */
  index: number;
  message: string;
}

export interface BulkResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: BulkRowError[];
}

export interface BulkRowHandlers<Row> {
  /**
   * Valida/normaliza la fila cruda del CSV (objeto JSON) en una fila tipada.
   * Debe lanzar (BadRequestException) si la fila es inválida.
   */
  prepare: (raw: Record<string, unknown>, index: number) => Promise<Row> | Row;
  /** Busca una fila existente por su clave única. Devuelve el registro o null. */
  findExisting: (row: Row) => Promise<unknown | null>;
  create: (row: Row) => Promise<unknown>;
  update: (existing: unknown, row: Row) => Promise<unknown>;
}

/**
 * Recorre las filas de un lote de importación aplicando el modo elegido. El
 * procesamiento es **fila por fila con éxito parcial**: un error en una fila no
 * aborta el resto; se acumula en `errors` con su índice para el reporte del modal.
 */
export async function runBulkImport<Row>(
  rawRows: Record<string, unknown>[],
  mode: ImportMode,
  handlers: BulkRowHandlers<Row>,
): Promise<BulkResult> {
  const result: BulkResult = {
    total: rawRows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < rawRows.length; i++) {
    try {
      const row = await handlers.prepare(rawRows[i] ?? {}, i);
      const existing = await handlers.findExisting(row);

      if (existing) {
        if (mode === 'create') {
          result.skipped++;
          continue;
        }
        await handlers.update(existing, row);
        result.updated++;
      } else {
        if (mode === 'update') {
          result.skipped++;
          continue;
        }
        await handlers.create(row);
        result.created++;
      }
    } catch (error) {
      result.errors.push({ index: i, message: toRowMessage(error) });
    }
  }

  return result;
}

/**
 * Valida un objeto plano contra una clase DTO (las mismas reglas de
 * class-validator que usa el endpoint de creación individual). Lanza
 * BadRequestException con el primer mensaje legible si algo no cumple.
 */
export async function validateAgainstDto<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): Promise<T> {
  const instance = plainToInstance(cls, plain, {
    enableImplicitConversion: false,
  });
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
  });
  if (errors.length > 0) {
    throw new BadRequestException(firstValidationMessage(errors));
  }
  return instance;
}

function firstValidationMessage(errors: ValidationError[]): string {
  for (const error of errors) {
    if (error.constraints) {
      const msg = Object.values(error.constraints)[0];
      if (msg) return msg;
    }
    if (error.children?.length) {
      const childMsg = firstValidationMessage(error.children);
      if (childMsg) return childMsg;
    }
  }
  return 'Fila inválida';
}

/** Extrae un mensaje legible de cualquier error lanzado al procesar una fila. */
function toRowMessage(error: unknown): string {
  if (error instanceof BadRequestException) {
    const res = error.getResponse();
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object' && 'message' in res) {
      const msg = (res as { message: unknown }).message;
      if (typeof msg === 'string') return msg;
      if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0];
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Error desconocido al procesar la fila';
}
