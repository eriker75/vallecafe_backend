import { Reflector } from '@nestjs/core';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { META_ROLES } from '../decorators/role-protected.decorator';

@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const validRoles: string[] = this.reflector.get(
      META_ROLES,
      context.getHandler(),
    );

    if (!validRoles) return true;
    if (validRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    // req.user es el POJO que devuelve Prisma, no una instancia de la clase User.
    // El modelo tiene un campo singular `role: string`, así que lo normalizamos
    // a un array para poder reutilizar la lógica de comparación.
    const user = req.user as { role: string; firstName: string; lastName: string };

    if (!user) throw new BadRequestException('User not found');

    const userRoles: string[] = user.role ? [user.role] : [];
    const fullName = `${user.firstName} ${user.lastName}`;

    if (userRoles.some((role) => validRoles.includes(role))) {
      return true;
    }

    throw new ForbiddenException(
      `User ${fullName} need a valid role: [${validRoles}]`,
    );
  }
}
