import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // No lanza si no hay token: req.user queda undefined para invitados.
  handleRequest(err: any, user: any) {
    return user ?? null;
  }
}
