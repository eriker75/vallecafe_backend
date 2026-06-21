import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { MailerService } from '../mailer/mailer.service';
import { CreateUserDto } from './dto/create-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { LOYALTY_POINTS_KEY } from '../loyalty/loyalty.service';
import { BulkImportDto } from '../common/dto/bulk-import.dto';
import {
  runBulkImport,
  validateAgainstDto,
  type BulkResult,
} from '../common/bulk/bulk-import.helper';
import { compactRow } from '../common/bulk/compact-row';
import { GoogleAuthService } from './google-auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { AppleAuthService } from './apple-auth.service';
import { AppleLoginDto } from './dto/apple-login.dto';

/** Duración del refresh token: 30 días en ms */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Columnas ordenables desde la tabla de clientes del admin (cabeceras clickeables).
// Mapea la clave pública que envía el front a la expresión SQL por la que se
// ordena. Incluye dos agregados sobre los pedidos NO cancelados del cliente:
//   · orders → nº de pedidos        · spent → total gastado (Σ order.total)
// Se ordena con SQL crudo porque Prisma no permite `orderBy` sobre la suma de un
// campo de una relación. Las claves son fijas (whitelist) → seguras para SQL.
const USER_SORT_SQL: Record<string, Prisma.Sql> = {
  name: Prisma.sql`u."firstName"`,
  email: Prisma.sql`u.email`,
  phone: Prisma.sql`u.phone`,
  status: Prisma.sql`u.status`,
  createdAt: Prisma.sql`u."createdAt"`,
  orders: Prisma.sql`"orderCount"`,
  spent: Prisma.sql`"totalSpent"`,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly googleAuth: GoogleAuthService,
    private readonly appleAuth: AppleAuthService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  // Selección pública del usuario: NUNCA incluye `password`. Se usa en todas las
  // respuestas (register/findAll/findOne/update) para no filtrar el hash bcrypt.
  private readonly publicUserSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    avatar: true,
    birthDate: true,
    phone: true,
    address: true,
    city: true,
    state: true,
    zip: true,
    country: true,
    latitude: true,
    longitude: true,
    role: true,
    status: true,
    accountType: true,
    createdAt: true,
    updatedAt: true,
    addresses: true,
  } as const;

  // Saldo de puntos de fidelidad del usuario (clave-valor en `user_settings`).
  // Se adjunta al objeto user que devolvemos al cliente para que la web muestre
  // su saldo (UserProfile.loyaltyPoints). 0 si aún no tiene fila.
  private async getLoyaltyPoints(userId: string): Promise<number> {
    const row = await this.prisma.userSetting.findUnique({
      where: { userId_metaKey: { userId, metaKey: LOYALTY_POINTS_KEY } },
      select: { metaValue: true },
    });
    if (!row) return 0;
    const n = parseInt(row.metaValue, 10);
    return Number.isFinite(n) ? n : 0;
  }

  // ── User settings (clave-valor por usuario, agrupado por metaGroup) ─────────
  // Preferencias del propio usuario (p.ej. notificaciones). La pertenencia la
  // verifica el controller.
  async getUserSettings(userId: string, group?: string) {
    return this.prisma.userSetting.findMany({
      where: { userId, ...(group ? { metaGroup: group } : {}) },
      select: { metaKey: true, metaValue: true, metaGroup: true },
      orderBy: { metaKey: 'asc' },
    });
  }

  // Upsert atómico por (userId, metaKey). Solo toca las claves recibidas, por lo
  // que NO afecta otras como `loyalty_points`.
  async upsertUserSettings(
    userId: string,
    settings: { metaKey: string; metaValue: string; metaGroup?: string }[],
  ) {
    await this.prisma.$transaction(
      settings.map((s) =>
        this.prisma.userSetting.upsert({
          where: { userId_metaKey: { userId, metaKey: s.metaKey } },
          update: {
            metaValue: s.metaValue,
            ...(s.metaGroup !== undefined ? { metaGroup: s.metaGroup } : {}),
          },
          create: {
            userId,
            metaKey: s.metaKey,
            metaValue: s.metaValue,
            metaGroup: s.metaGroup ?? null,
          },
        }),
      ),
    );
    return this.getUserSettings(userId);
  }

  // Emite una sesión (tokens + datos limpios del usuario, SIN password) para un
  // userId dado. La usa el checkout para autenticar automáticamente a un comprador
  // invitado (cuenta sin contraseña). Mismo shape plano que login()/register().
  async buildSessionForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        country: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }
    // Mismo criterio que login()/refresh(): no emitir sesión a cuentas inactivas.
    if (user.status !== 'active') {
      throw new UnauthorizedException(
        'Usuario inactivo, contacta con un administrador',
      );
    }
    const loyaltyPoints = await this.getLoyaltyPoints(userId);
    const { accessToken, refreshToken } = await this.issueTokenPair(userId);
    const { deletedAt: _deletedAt, ...safeUser } = user;
    return { ...safeUser, loyaltyPoints, accessToken, refreshToken };
  }

  // ── tokens ────────────────────────────────────────────────────────────────────

  private signAccessToken(userId: string): string {
    const payload: JwtPayload = { id: userId };
    return this.jwtService.sign(payload);
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
    return token;
  }

  private async issueTokenPair(userId: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(userId),
      this.createRefreshToken(userId),
    ]);
    return { accessToken, refreshToken };
  }

  // ── Verificación de correo + recuperación de contraseña ──────────────────────

  // Base del frontend para construir los enlaces de los correos. Prioriza
  // FRONTEND_URL; si no, usa el primer origen de CORS_ORIGIN; default localhost.
  private get frontendUrl(): string {
    const explicit = this.config.get<string>('FRONTEND_URL');
    if (explicit) return explicit.replace(/\/+$/, '');
    const cors = this.config.get<string>('CORS_ORIGIN');
    const first = cors?.split(/[;,]/)[0]?.trim();
    return (first || 'http://localhost:7050').replace(/\/+$/, '');
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  // Crea un token de un solo uso: devuelve el valor EN CLARO (va en el enlace)
  // y guarda solo su hash. Invalida los tokens previos del mismo tipo del usuario.
  private async createVerificationToken(
    userId: string,
    type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
    ttlMs: number,
  ): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await this.prisma.$transaction([
      this.prisma.verificationToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.verificationToken.create({
        data: {
          userId,
          type,
          tokenHash: this.hashToken(raw),
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
    return raw;
  }

  // Genera y envía el correo de verificación. Best-effort: nunca lanza (no debe
  // romper el registro). Si el correo ya está verificado, no hace nada.
  async sendVerificationEmail(user: {
    id: string;
    email: string;
    firstName: string;
    emailVerified?: boolean;
  }): Promise<void> {
    try {
      if (user.emailVerified) return;
      const raw = await this.createVerificationToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000, // 24h
      );
      const link = `${this.frontendUrl}/verify-email?token=${raw}`;
      await this.mailer.sendVerificationEmail(user.email, user.firstName, link);
      // (ruta web standalone /verify-email, sin guard de sesión)
    } catch (error) {
      console.error(
        `[verify-email] no se pudo enviar a ${user.email}:`,
        (error as Error)?.message ?? error,
      );
    }
  }

  // Reenvío del correo de verificación (endpoint público, sin enumeración).
  async resendVerification(email: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true, email: true, firstName: true, emailVerified: true },
    });
    if (user && !user.emailVerified) {
      await this.sendVerificationEmail(user);
    }
    return { success: true };
  }

  // Consume el token y marca el correo como verificado.
  async verifyEmail(rawToken: string): Promise<{ success: true }> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });
    if (
      !record ||
      record.type !== 'EMAIL_VERIFICATION' ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestException('Enlace inválido o expirado');
    }
    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  // "Olvidé mi contraseña". SIEMPRE responde success (no revela si el correo
  // existe → evita enumeración de usuarios). Solo envía si hay cuenta CON
  // contraseña local (las cuentas solo-social no tienen qué restablecer).
  async requestPasswordReset(email: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true, email: true, firstName: true, password: true },
    });
    if (user?.password) {
      const raw = await this.createVerificationToken(
        user.id,
        'PASSWORD_RESET',
        60 * 60 * 1000, // 1h
      );
      // /account/reset-password es público (sin guard) y ya lee ?token.
      const link = `${this.frontendUrl}/account/reset-password?token=${raw}`;
      await this.mailer.sendPasswordResetEmail(user.email, user.firstName, link);
    }
    return { success: true };
  }

  // Consume el token de reset, fija la nueva contraseña y revoca las sesiones
  // activas (refresh tokens) por seguridad.
  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });
    if (
      !record ||
      record.type !== 'PASSWORD_RESET' ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestException('Enlace inválido o expirado');
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashedPassword },
      }),
      // Cierra todas las sesiones: tras un reset, los dispositivos viejos
      // deben volver a iniciar sesión con la contraseña nueva.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);
    return { success: true };
  }

  // ── usuarios ──────────────────────────────────────────────────────────────────

  private async createUser(data: Prisma.UserCreateInput) {
    const { password, ...rest } = data;
    // password es opcional en el modelo (cuentas sólo-social), pero el alta clásica la exige
    if (!password) {
      throw new BadRequestException('Se requiere una contraseña');
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const user = await this.prisma.user.create({
        data: { ...rest, password: hashedPassword },
        select: this.publicUserSelect,
      });

      // Best-effort: registra al usuario también como Contact (fuente: registro web).
      // Nunca debe romper el alta si algo falla (p.ej. email duplicado en contacts).
      await this.upsertContactForUser(user);

      const { accessToken, refreshToken } = await this.issueTokenPair(user.id);
      // Envía el correo de verificación (best-effort: no bloquea ni rompe el alta).
      void this.sendVerificationEmail({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
      });
      // Usuario recién creado: aún no tiene puntos acumulados.
      return { ...user, loyaltyPoints: 0, accessToken, refreshToken };
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un usuario registrado con ese correo electrónico',
        );
      }
      throw error;
    }
  }

  /**
   * Crea/actualiza un Contact a partir de un User recién registrado, vinculándolo
   * por su id. Best-effort: cualquier error se traga (sólo se loguea) para que
   * jamás impida completar el alta del usuario.
   */
  private async upsertContactForUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
  }): Promise<void> {
    try {
      const email = user.email.toLowerCase();
      await this.prisma.contact.upsert({
        where: { email },
        create: {
          firstName: user.firstName,
          lastName: user.lastName,
          email,
          phone: user.phone ?? undefined,
          userId: user.id,
        },
        update: { userId: user.id },
      });
    } catch (error: unknown) {
      console.error(
        '[register] no se pudo crear/actualizar el Contact:',
        error,
      );
    }
  }

  async register(registerUserDto: RegisterUserDto) {
    return this.createUser({
      ...registerUserDto,
      role: 'customer',
      status: 'active',
    });
  }

  async registerAdmin(registerUserDto: RegisterUserDto) {
    return this.createUser({
      ...registerUserDto,
      role: 'admin',
      status: 'active',
    });
  }

  async create(createUserDto: CreateUserDto) {
    return this.createUser(createUserDto);
  }

  async login(loginUserDto: LoginUserDto) {
    const { email, password } = loginUserDto;
    console.log('[login] intento con email:', email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        password: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt) {
      console.log('[login] usuario no encontrado/borrado para:', email);
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    console.log(
      '[login] usuario encontrado → status:',
      user.status,
      '| role:',
      user.role,
    );

    if (user.status !== 'active') {
      console.log('[login] usuario inactivo');
      throw new UnauthorizedException(
        'Usuario inactivo, contacta con un administrador',
      );
    }

    if (!user.password) {
      // Cuenta creada vía login social (Google/Apple): no tiene contraseña local
      throw new UnauthorizedException(
        'Esta cuenta inicia sesión con Google/Apple',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('[login] password válido:', isPasswordValid);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const { password: _, deletedAt: _deletedAt, ...userWithoutPassword } = user;
    const { accessToken, refreshToken } = await this.issueTokenPair(user.id);
    const loyaltyPoints = await this.getLoyaltyPoints(user.id);
    console.log('[login] OK → id:', user.id);
    return { ...userWithoutPassword, loyaltyPoints, accessToken, refreshToken };
  }

  // ── login social (Google / Apple) ───────────────────────────────────────────
  // Un único endpoint por proveedor sirve para iniciar sesión y para registrarse:
  //   1) verifica el token del proveedor (firma + audiencia = nuestros client IDs),
  //   2) busca por (provider, sub) en social_accounts → ya vinculado,
  //   3) si no, busca por email → vincula la cuenta social al User existente,
  //   4) si tampoco, crea el User (sin contraseña) + su SocialAccount.
  // Siempre emite el MISMO shape que login()/register() (vía buildSessionForUser).
  async googleLogin(dto: GoogleLoginDto) {
    const payload = await this.googleAuth.verify(dto.idToken);
    // Google marca email_verified; no aceptamos correos sin verificar para no
    // permitir tomar la cuenta de otro que sí registró ese email con contraseña.
    if (payload.email_verified === false) {
      throw new UnauthorizedException('El email de Google no está verificado');
    }
    const userId = await this.resolveSocialUser(
      'google',
      {
        providerAccountId: payload.sub,
        email: payload.email,
        firstName: payload.given_name,
        lastName: payload.family_name,
        name: payload.name,
        avatar: payload.picture,
      },
      dto.accountType,
    );
    return this.buildSessionForUser(userId);
  }

  // Apple: el identity_token NO trae el nombre (sólo llega del cliente en el
  // PRIMER inicio de sesión; el front lo reenvía en firstName/lastName). En
  // accesos posteriores ya existe la SocialAccount, así que no se necesita.
  async appleLogin(dto: AppleLoginDto) {
    const payload = await this.appleAuth.verify(dto.identityToken);
    const userId = await this.resolveSocialUser(
      'apple',
      {
        providerAccountId: payload.sub,
        email: payload.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      dto.accountType,
    );
    return this.buildSessionForUser(userId);
  }

  // Resuelve el `id` (UUID) del User a autenticar para un login social, creándolo
  // o vinculándolo si hace falta. Compartido por Google y Apple.
  private async resolveSocialUser(
    provider: 'google' | 'apple',
    profile: {
      providerAccountId: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      name?: string;
      avatar?: string;
    },
    accountType?: string,
  ): Promise<string> {
    const { providerAccountId } = profile;
    if (!providerAccountId) {
      throw new UnauthorizedException(
        'Token social sin identificador de usuario',
      );
    }
    const email = profile.email?.toLowerCase().trim();
    const composed = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(' ');
    const name = profile.name ?? (composed.length > 0 ? composed : undefined);
    const avatar = profile.avatar;

    // 1) ¿Ya existe la cuenta social vinculada?
    const existingSocial = await this.prisma.socialAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      select: { userId: true, user: { select: { deletedAt: true } } },
    });
    if (existingSocial) {
      if (existingSocial.user.deletedAt) {
        throw new UnauthorizedException('Cuenta deshabilitada');
      }
      // Refresca el snapshot informativo del proveedor (best-effort).
      await this.prisma.socialAccount.update({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        data: { email, name, avatar },
      });
      return existingSocial.userId;
    }

    // A partir de aquí necesitamos el email para crear/vincular. Apple sólo lo
    // envía en el primer login; si falta y no había SocialAccount, no podemos.
    if (!email) {
      throw new UnauthorizedException(
        'El proveedor no devolvió un email para crear la cuenta',
      );
    }

    // 2) ¿Existe un User con ese email? (email es @unique, con o sin borrado)
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, deletedAt: true },
    });
    if (existingUser) {
      if (existingUser.deletedAt) {
        throw new UnauthorizedException('Cuenta deshabilitada');
      }
      // Vincula el proveedor a la cuenta existente (que pudo crearse con contraseña).
      await this.prisma.socialAccount.create({
        data: {
          userId: existingUser.id,
          provider,
          providerAccountId,
          email,
          name,
          avatar,
        },
      });
      return existingUser.id;
    }

    // 3) Usuario nuevo: lo creamos SIN contraseña (cuenta sólo-social) junto a su
    // SocialAccount. Los campos obligatorios de contacto se dejan vacíos (el
    // cliente los completa luego en su perfil/checkout).
    const firstName =
      profile.firstName ?? profile.name?.split(' ')[0] ?? 'Cliente';
    const lastName =
      profile.lastName ?? profile.name?.split(' ').slice(1).join(' ') ?? '';
    const created = await this.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        avatar,
        phone: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        role: 'customer',
        status: 'active',
        accountType: accountType ?? 'B2C',
        socialAccounts: {
          create: { provider, providerAccountId, email, name, avatar },
        },
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    // Best-effort: registrar también como Contact (fuente: registro social).
    await this.upsertContactForUser({ ...created, phone: null });

    return created.id;
  }

  // ── refresh & logout ──────────────────────────────────────────────────────────

  async refresh(rawToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: rawToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (stored.user.deletedAt) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (stored.user.status !== 'active') {
      throw new UnauthorizedException('Usuario inactivo');
    }

    // Rotación: revocar el token usado y emitir uno nuevo
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const { accessToken, refreshToken } = await this.issueTokenPair(
      stored.user.id,
    );
    const loyaltyPoints = await this.getLoyaltyPoints(stored.user.id);
    const { deletedAt: _deletedAt, ...safeUser } = stored.user;
    return { ...safeUser, loyaltyPoints, accessToken, refreshToken };
  }

  async logout(rawToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token: rawToken, isRevoked: false },
      data: { isRevoked: true },
    });
    return { message: 'Sesión cerrada correctamente' };
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async findAll({
    limit,
    offset,
    search,
    role,
    status,
    accountType,
    sortBy,
    order,
  }: UserQueryDto) {
    // Filtros del listado, como fragmentos SQL parametrizados (seguros ante
    // inyección). Soft delete: nunca listamos clientes con deletedAt != NULL.
    const conditions: Prisma.Sql[] = [Prisma.sql`u."deletedAt" IS NULL`];
    if (role) conditions.push(Prisma.sql`u.role = ${role}`);
    if (status) conditions.push(Prisma.sql`u.status = ${status}`);
    if (accountType) conditions.push(Prisma.sql`u."accountType" = ${accountType}`);
    if (search) {
      const like = `%${search}%`;
      conditions.push(
        Prisma.sql`(u.email ILIKE ${like} OR u."firstName" ILIKE ${like} OR u."lastName" ILIKE ${like})`,
      );
    }
    const where = Prisma.join(conditions, ' AND ');

    // Orden: columna por whitelist (USER_SORT_SQL) + dirección validada. El total
    // gastado y el nº de pedidos se agregan con un LEFT JOIN sobre pedidos NO
    // cancelados (mismo criterio que Finanzas), por lo que los clientes sin
    // pedidos también aparecen (con 0). Se ordena y pagina en la BD.
    const sortExpr = USER_SORT_SQL[sortBy ?? ''] ?? Prisma.sql`u."createdAt"`;
    const dir = order === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');

    const ranked = await this.prisma.$queryRaw<
      { id: string; orderCount: number; totalSpent: string }[]
    >(Prisma.sql`
      SELECT u.id,
             (COUNT(o.id) FILTER (WHERE o.status <> 'CANCELLED'))::int AS "orderCount",
             (COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'CANCELLED'), 0))::text AS "totalSpent"
      FROM users u
      LEFT JOIN orders o ON o."userId" = u.id
      WHERE ${where}
      GROUP BY u."userId"
      ORDER BY ${sortExpr} ${dir}, u."createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const totalRows = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS count FROM users u WHERE ${where}`,
    );
    const total = totalRows[0]?.count ?? 0;

    // Hidratamos los usuarios completos (sin password, con direcciones) vía Prisma
    // y reaplicamos el orden de la consulta agregada, adjuntando los agregados.
    const ids = ranked.map((r) => r.id);
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: this.publicUserSelect,
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const data = ranked.flatMap((r) => {
      const user = byId.get(r.id);
      return user
        ? [{ ...user, orderCount: r.orderCount, totalSpent: r.totalSpent }]
        : [];
    });

    return { data, total, limit, offset };
  }

  async findOne(id: string) {
    // findFirst (no findUnique) para poder filtrar también por deletedAt: un
    // cliente borrado (soft delete) se trata como inexistente.
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const loyaltyPoints = await this.getLoyaltyPoints(user.id);
    return { ...user, loyaltyPoints };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id);

    const { password, ...rest } = updateUserDto;
    const data = password
      ? { ...rest, password: await bcrypt.hash(password, 10) }
      : rest;

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: this.publicUserSelect,
    });
    // Adjuntar el saldo de puntos (como findOne) para que el cliente no lo
    // "pierda" tras editar el perfil (el select no incluye user_settings).
    const loyaltyPoints = await this.getLoyaltyPoints(id);
    return { ...updated, loyaltyPoints };
  }

  // Cambio de contraseña verificando la actual (flujo seguro de "cambiar
  // contraseña" desde el perfil). El control de pertenencia lo hace el controller.
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException(`User with id ${userId} not found`);
    if (!user.password) {
      throw new BadRequestException(
        'Esta cuenta inicia sesión con Google/Apple; no tiene contraseña local.',
      );
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid)
      throw new UnauthorizedException('La contraseña actual es incorrecta');

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });
    return { success: true };
  }

  async remove(id: string) {
    await this.findOne(id); // 404 si no existe o ya estaba borrado

    // Soft delete: NO borramos la fila. Marcamos deletedAt para conservar toda la
    // información del cliente (datos, pedidos, historial) y a la vez sacarlo de los
    // listados/stats. Revocamos sus sesiones para que no pueda seguir autenticado.
    const [deleted] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
        select: this.publicUserSelect,
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);
    return deleted;
  }

  // Importación masiva de clientes desde CSV. Clave única para duplicados:
  // `email` (@unique). En modo create, si el CSV no trae contraseña se genera
  // una temporal aleatoria (el cliente la restablece con "olvidé mi contraseña");
  // importar contraseñas en texto plano no es realista para una lista migrada.
  async bulkImport({ mode, rows }: BulkImportDto): Promise<BulkResult> {
    return runBulkImport<Record<string, unknown>>(rows, mode, {
      prepare: (raw) =>
        compactRow({
          email: raw.email,
          firstName: raw.firstName,
          lastName: raw.lastName,
          password: raw.password,
          phone: raw.phone,
          address: raw.address,
          city: raw.city,
          state: raw.state,
          zip: raw.zip,
          country: raw.country,
          birthDate: raw.birthDate,
          latitude: raw.latitude,
          longitude: raw.longitude,
          role: raw.role,
          status: raw.status,
          accountType: raw.accountType,
        }),
      findExisting: async (row) =>
        typeof row.email === 'string'
          ? this.prisma.user.findFirst({
              where: { email: row.email, deletedAt: null },
            })
          : null,
      create: async (row) => {
        const withPassword = {
          ...row,
          password: row.password ?? randomBytes(9).toString('base64url'),
        };
        const dto = await validateAgainstDto(CreateUserDto, withPassword);
        return this.create(dto);
      },
      update: async (existing, row) => {
        const dto = await validateAgainstDto(UpdateUserDto, row);
        return this.update((existing as { id: string }).id, dto);
      },
    });
  }

  async getCustomerStats() {
    // deletedAt: null en cada conteo para no incluir clientes borrados (soft delete).
    const [total, active, inactive] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { role: 'customer', deletedAt: null } }),
      this.prisma.user.count({
        where: { role: 'customer', status: 'active', deletedAt: null },
      }),
      this.prisma.user.count({
        where: { role: 'customer', status: 'inactive', deletedAt: null },
      }),
    ]);
    return { total, active, inactive };
  }
}
