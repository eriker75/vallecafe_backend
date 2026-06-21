// Horario de servicio de la tienda, configurable desde el admin como settings
// (grupo HOURS). El horario es por día de la semana con hora de apertura/cierre
// en la ZONA HORARIA de la tienda (hours_timezone, IANA). La política decide qué
// pasa con un pedido fuera de horario: 'notify' (se acepta y se avisa que se
// procesa en la próxima apertura) o 'block' (el checkout lo rechaza).
//
// La web duplica esta lógica en web/lib/store-hours.ts para pintar los avisos
// del carrito sin ir al servidor; la validación de 'block' SIEMPRE es de servidor.

export const HOURS_GROUP = 'HOURS';
export const HOURS_SCHEDULE_KEY = 'hours_schedule';
export const HOURS_TIMEZONE_KEY = 'hours_timezone';
export const HOURS_POLICY_KEY = 'hours_policy';

export const DEFAULT_TIMEZONE = 'America/Caracas';

// Orden de Date.getDay(): 0 = domingo.
export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS_ES: Record<DayKey, string> = {
  sun: 'domingo',
  mon: 'lunes',
  tue: 'martes',
  wed: 'miércoles',
  thu: 'jueves',
  fri: 'viernes',
  sat: 'sábado',
};

export type DaySchedule = {
  closed: boolean;
  open: string; // "HH:MM" (hora local de la tienda)
  close: string; // "HH:MM"
};

export type StoreSchedule = Record<DayKey, DaySchedule>;

export type NextOpening = {
  dayKey: DayKey;
  dayLabel: string; // "martes"
  dateLabel: string; // "10/06"
  time: string; // "07:00"
  daysAhead: number; // 0 = hoy
};

export type StoreStatus = {
  isOpen: boolean;
  nextOpening: NextOpening | null; // null si ningún día está abierto
};

// "HH:MM" → minutos desde medianoche; null si el formato no es válido.
function toMinutes(hhmm: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Un día cuenta como "abre" solo si no está cerrado y open < close (no se
// soportan horarios nocturnos que crucen medianoche; un rango inválido se
// trata como día cerrado para fallar cerrado).
function dayOpensAt(day: DaySchedule | undefined): { open: number; close: number } | null {
  if (!day || day.closed) return null;
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (open === null || close === null || open >= close) return null;
  return { open, close };
}

// Parsea el JSON guardado en settings. Devuelve null si no hay horario
// configurado o el JSON es inválido (→ la tienda se considera siempre abierta,
// que es el comportamiento previo a esta feature).
export function parseSchedule(json: string | null | undefined): StoreSchedule | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, Partial<DaySchedule>>;
    const schedule = {} as StoreSchedule;
    for (const key of DAY_KEYS) {
      const d = raw?.[key];
      schedule[key] = {
        closed: d?.closed === true,
        open: typeof d?.open === 'string' ? d.open : '',
        close: typeof d?.close === 'string' ? d.close : '',
      };
    }
    return schedule;
  } catch {
    return null;
  }
}

// Fecha/hora actual proyectada a la zona horaria de la tienda, como componentes
// de calendario (no como Date). Si la zona es inválida cae a la default y, en
// último término, a UTC.
function zonedNow(timeZone: string, now: Date): {
  dayIndex: number; // 0 = domingo
  minutes: number;
  year: number;
  month: number; // 1-12
  day: number;
} {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return timeZone === DEFAULT_TIMEZONE
      ? zonedNow('UTC', now)
      : zonedNow(DEFAULT_TIMEZONE, now);
  }
  const get = (type: Intl.DateTimeFormatPart['type']) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    dayIndex: weekdayIndex < 0 ? 0 : weekdayIndex,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Estado actual de la tienda según el horario: ¿está abierta ahora? y si no,
// ¿cuándo es la próxima apertura? (busca hasta 7 días hacia adelante).
export function getStoreStatus(
  schedule: StoreSchedule,
  timeZone: string,
  now: Date = new Date(),
): StoreStatus {
  const local = zonedNow(timeZone || DEFAULT_TIMEZONE, now);

  const today = dayOpensAt(schedule[DAY_KEYS[local.dayIndex]]);
  const isOpen = !!today && local.minutes >= today.open && local.minutes < today.close;

  let nextOpening: NextOpening | null = null;
  for (let offset = 0; offset <= 7; offset++) {
    const dayKey = DAY_KEYS[(local.dayIndex + offset) % 7];
    const range = dayOpensAt(schedule[dayKey]);
    if (!range) continue;
    if (offset === 0 && local.minutes >= range.open) continue; // hoy ya abrió (o cerró)
    // Aritmética de calendario pura: Date.UTC normaliza día+offset sin depender
    // de la zona horaria del servidor.
    const date = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    nextOpening = {
      dayKey,
      dayLabel: DAY_LABELS_ES[dayKey],
      dateLabel: `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}`,
      time: `${pad2(Math.floor(range.open / 60))}:${pad2(range.open % 60)}`,
      daysAhead: offset,
    };
    break;
  }

  return { isOpen, nextOpening };
}

// "el martes 10/06 a las 07:00" / "hoy a las 07:00" — para mensajes al cliente.
export function nextOpeningLabel(next: NextOpening | null): string | null {
  if (!next) return null;
  if (next.daysAhead === 0) return `hoy a las ${next.time}`;
  if (next.daysAhead === 1) return `mañana ${next.dayLabel} ${next.dateLabel} a las ${next.time}`;
  return `el ${next.dayLabel} ${next.dateLabel} a las ${next.time}`;
}
