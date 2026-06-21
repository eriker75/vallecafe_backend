// Plantillas HTML de los correos transaccionales. Inline-styles a propósito:
// los clientes de correo (Gmail, Outlook…) ignoran <style> y CSS externo, así
// que todo el estilo va en el atributo style de cada elemento.

const BRAND = {
  name: 'Valle Café',
  dark: '#3B2A1E',
  accent: '#C06A2B',
  beige: '#F3ECE4',
};

function layout(opts: {
  heading: string;
  intro: string;
  buttonLabel: string;
  link: string;
  footnote: string;
}): string {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:${BRAND.beige};font-family:Arial,Helvetica,sans-serif;color:${BRAND.dark};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.beige};padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${BRAND.dark};padding:24px 32px;">
          <span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:1px;">${BRAND.name}</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND.dark};">${opts.heading}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#444;">${opts.intro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td align="center" style="border-radius:999px;background:${BRAND.accent};">
              <a href="${opts.link}" target="_blank"
                 style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px;">
                ${opts.buttonLabel}
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#777;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
          <p style="margin:0 0 24px;font-size:12px;word-break:break-all;"><a href="${opts.link}" style="color:${BRAND.accent};">${opts.link}</a></p>
          <p style="margin:0;font-size:13px;color:#999;border-top:1px solid #eee;padding-top:16px;">${opts.footnote}</p>
        </td></tr>
        <tr><td style="background:${BRAND.beige};padding:16px 32px;text-align:center;">
          <span style="font-size:12px;color:#999;">© ${BRAND.name}. Este es un correo automático, no respondas a este mensaje.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function verificationEmail(p: { firstName: string; link: string }): string {
  return layout({
    heading: `¡Bienvenido/a, ${p.firstName}!`,
    intro:
      'Gracias por registrarte. Confirma que este correo es tuyo para activar todas las funciones de tu cuenta. El enlace vence en 24 horas.',
    buttonLabel: 'Confirmar mi correo',
    link: p.link,
    footnote:
      'Si tú no creaste esta cuenta, puedes ignorar este mensaje sin problema.',
  });
}

export function passwordResetEmail(p: { firstName: string; link: string }): string {
  return layout({
    heading: 'Recupera tu contraseña',
    intro: `Hola ${p.firstName}, recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva. El enlace vence en 1 hora.`,
    buttonLabel: 'Crear nueva contraseña',
    link: p.link,
    footnote:
      'Si tú no solicitaste este cambio, ignora este correo: tu contraseña actual sigue siendo válida.',
  });
}
