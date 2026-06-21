import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  passwordResetEmail,
  verificationEmail,
} from './templates/email.templates';

/**
 * Envío de correos transaccionales por SMTP.
 *
 * Dev:  Mailpit (SMTP_HOST=mailpit, puerto 1025) — captura sin enviar nada real.
 * Prod: Resend vía SMTP (SMTP_HOST=smtp.resend.com, user "resend", pass = API key,
 *       SMTP_FROM con dominio verificado en Resend).
 *
 * Construcción perezosa del transporte: si el SMTP no está configurado, los
 * envíos se omiten con un warning en lugar de romper el flujo (un registro o un
 * "olvidé mi contraseña" nunca debe fallar porque el correo no salió).
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter?: Transporter;
  private transporterReady = false;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): Transporter | undefined {
    if (this.transporterReady) return this.transporter;
    this.transporterReady = true;

    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn(
        'SMTP_HOST no configurado: los correos NO se enviarán (se omiten).',
      );
      return undefined;
    }

    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      // 465 = TLS implícito; 587/1025 = STARTTLS / sin cifrado (Mailpit en dev).
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    this.logger.log(`Transporte SMTP listo (host=${host}, port=${port}).`);
    return this.transporter;
  }

  private get from(): string {
    return (
      this.config.get<string>('SMTP_FROM') ?? 'Terroir <noreply@terroir.local>'
    );
  }

  /** true si hay SMTP configurado (para reflejarlo en respuestas/diagnóstico). */
  isConfigured(): boolean {
    return !!this.config.get<string>('SMTP_HOST');
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) return; // sin SMTP: no-op (ya avisado por warning)
    try {
      await transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Correo enviado a ${to}: "${subject}"`);
    } catch (error) {
      // Best-effort: registrar y seguir. El flujo de negocio no depende del correo.
      this.logger.error(
        `Fallo enviando correo a ${to} ("${subject}"): ${(error as Error)?.message}`,
      );
    }
  }

  async sendVerificationEmail(
    to: string,
    firstName: string,
    link: string,
  ): Promise<void> {
    await this.send(
      to,
      'Confirma tu correo electrónico',
      verificationEmail({ firstName, link }),
    );
  }

  async sendPasswordResetEmail(
    to: string,
    firstName: string,
    link: string,
  ): Promise<void> {
    await this.send(
      to,
      'Recupera tu contraseña',
      passwordResetEmail({ firstName, link }),
    );
  }
}
