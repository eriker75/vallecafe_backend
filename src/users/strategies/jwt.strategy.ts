import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/database.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      secretOrKey: configService.getOrThrow('JWT_SECRET') as string,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
  }

  async validate(payload: JwtPayload) {
    const { id } = payload;

    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) throw new UnauthorizedException('Token not valid');

    // Soft delete: un cliente borrado no puede seguir autenticado aunque su
    // access token siga vigente.
    if (user.deletedAt) throw new UnauthorizedException('Token not valid');

    if (user.status !== 'active')
      throw new UnauthorizedException('User is inactive, talk with an admin');

    return user;
  }
}
