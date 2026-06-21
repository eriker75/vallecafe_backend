/**
 * Log estructurado para Google Cloud Logging.
 *
 * Cloud Run captura todo lo que va a stdout; si la línea es un JSON válido,
 * Cloud Logging la interpreta como `jsonPayload` y respeta los campos
 * especiales `severity` y `message`. Esto permite filtrar en el explorador de
 * logs por, p. ej., `jsonPayload.event="r4.webhook.notifica.in"` y leer el
 * cuerpo COMPLETO que envió el banco (qué clave manda como UUID, qué trae el
 * body, etc.). En local simplemente se ve el JSON en consola.
 *
 * NOTA: cada entrada debe ser UNA sola línea (Cloud Logging no agrupa
 * multilínea); por eso usamos JSON.stringify sin indentación.
 */
export type GcpSeverity =
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'ERROR'
  | 'CRITICAL';

export function gcpLog(
  severity: GcpSeverity,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    severity,
    message: event,
    event,
    ...fields,
  });
  // ERROR/CRITICAL a stderr para que Cloud Run los marque como errores.
  if (severity === 'ERROR' || severity === 'CRITICAL') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}
