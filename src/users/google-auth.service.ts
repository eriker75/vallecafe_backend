import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

/**
 * Verifica los `id_token` de Google (login social). Sigue el patrón del ejemplo
 * `icatam-main` (OAuth2Client.verifyIdToken), endurecido para Terroir:
 *   · valida la firma del token contra las llaves públicas de Google,
 *   · comprueba que el `aud` sea uno de NUESTROS client IDs (web/iOS/Android),
 *     evitando que un id_token emitido para otra app se acepte aquí.
 *
 * NO requiere client secret: la verificación de id_token es pública. Los client
 * IDs se configuran por entorno (uno por plataforma desde Google Cloud Console).
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client = new OAuth2Client();
  private readonly audiences: string[];

  constructor(config: ConfigService) {
    // Acepta el id_token venga de la web (GIS), iOS o Android. Cada plataforma usa
    // su propio client ID, pero todos son "nuestros".
    this.audiences = [
      config.get<string>('GOOGLE_WEB_CLIENT_ID'),
      config.get<string>('GOOGLE_IOS_CLIENT_ID'),
      config.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
    ].filter((v): v is string => !!v);

    if (this.audiences.length === 0) {
      this.logger.warn(
        'No hay GOOGLE_*_CLIENT_ID configurados: el login con Google fallará hasta definirlos.',
      );
    }
  }

  async verify(idToken: string): Promise<TokenPayload> {
    if (this.audiences.length === 0) {
      throw new UnauthorizedException('Login con Google no configurado');
    }
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audiences,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('Sin payload');
      return payload;
    } catch (error) {
      this.logger.warn(
        `id_token de Google inválido: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Token de Google inválido');
    }
  }
}
