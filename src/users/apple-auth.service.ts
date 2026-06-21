import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin, { type AppleIdTokenType } from 'apple-signin-auth';

/**
 * Verifica los `identity_token` de "Sign in with Apple". Análogo a
 * GoogleAuthService: valida la firma del token contra las llaves públicas de
 * Apple (https://appleid.apple.com/auth/keys) y que el `aud` sea uno de NUESTROS
 * client IDs.
 *
 * El `aud` depende de la plataforma:
 *   · iOS nativo (expo-apple-authentication) → el BUNDLE ID de la app
 *     (com.terroir.eribert).
 *   · Web (Sign in with Apple JS)            → el SERVICES ID (p.ej. com.terroir.web).
 * Por eso aceptamos ambos como audiencia válida.
 *
 * Igual que en Google, NO necesitamos secretos del lado servidor para verificar
 * el token (la verificación de identity_token es pública).
 */
@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);
  private readonly audiences: string[];

  constructor(config: ConfigService) {
    this.audiences = [
      config.get<string>('APPLE_BUNDLE_ID'),
      config.get<string>('APPLE_SERVICE_ID'),
    ].filter((v): v is string => !!v);

    if (this.audiences.length === 0) {
      this.logger.warn(
        'No hay APPLE_BUNDLE_ID / APPLE_SERVICE_ID configurados: el login con Apple fallará hasta definirlos.',
      );
    }
  }

  async verify(identityToken: string): Promise<AppleIdTokenType> {
    if (this.audiences.length === 0) {
      throw new UnauthorizedException('Login con Apple no configurado');
    }
    try {
      // verifyIdToken comprueba firma (JWKS de Apple), `iss`, `exp` y el `aud`.
      return await appleSignin.verifyIdToken(identityToken, {
        audience: this.audiences,
        ignoreExpiration: false,
      });
    } catch (error) {
      this.logger.warn(
        `identity_token de Apple inválido: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Token de Apple inválido');
    }
  }
}
