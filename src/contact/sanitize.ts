/**
 * Sanitiza texto plano proveniente de un formulario público antes de
 * persistirlo. Defensa en profundidad contra XSS almacenado: aunque el
 * dashboard (React) escapa al renderizar, el valor podría reutilizarse en
 * emails, exports o respuestas HTML donde no haya escape automático.
 *
 * - Elimina etiquetas HTML completas (`<script>…</script>`, `<b>`, etc.)
 * - Elimina cualquier `<` o `>` suelto que quede.
 * - Colapsa espacios en blanco excesivos y recorta extremos.
 */
export function sanitizePlainText(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '') // quita etiquetas HTML
    .replace(/[<>]/g, '') // quita < o > sueltos
    .replace(/[ \t]{2,}/g, ' ') // colapsa espacios/tabs repetidos
    .replace(/\n{3,}/g, '\n\n') // máximo una línea en blanco seguida
    .trim();
}
