import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Igual que @GetUser pero NO lanza si no hay usuario: devuelve null para invitados.
// Pensado para endpoints públicos protegidos con OptionalJwtAuthGuard, donde el
// usuario autenticado (si lo hay) modula la respuesta — p. ej. el catálogo, que
// muestra precios/visibilidad distintos a un mayorista.
export const OptionalUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user ?? null;
    if (!user) return null;
    return !data ? user : user[data];
  },
);
