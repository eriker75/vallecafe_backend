/**
 * Crea (o restablece) un usuario administrador usando el MISMO stack que la app:
 * Prisma (con el adapter PrismaPg, porque el datasource no define `url`) + bcrypt
 * (mismo algoritmo/rounds que el login). Evita los problemas del SQL con pgcrypto
 * (hash incompatible / DB equivocada) y NO depende de ts-node ni del tsconfig.
 *
 * Es CommonJS a propósito para correr con `node` pelado dentro del contenedor
 * (la carpeta ./prisma está montada; package.json no, por eso no usamos npm).
 *
 * Uso:
 *   make create-admin                                   → eriadmin@gmail.com / Admin123?
 *   make create-admin EMAIL=tu@correo.com PASS='Clave1?'
 *   docker exec -e ADMIN_EMAIL=.. -e ADMIN_PASSWORD=.. terroir_backend node prisma/seed-admin.cjs
 *
 * El email se guarda en minúsculas; al iniciar sesión escríbelo en minúsculas.
 */
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

(async () => {
  const [, , argEmail, argPassword] = process.argv;
  const email = (argEmail || process.env.ADMIN_EMAIL || 'eriadmin@gmail.com').toLowerCase().trim();
  const password = argPassword || process.env.ADMIN_PASSWORD || 'Admin123?';
  const firstName = process.env.ADMIN_FIRST_NAME || 'Eri';
  const lastName = process.env.ADMIN_LAST_NAME || 'Admin';

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está definido en el entorno del contenedor.');
  }

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
      where: { email },
      // Si ya existe (p.ej. creado por login social o checkout invitado, sin
      // contraseña), le fijamos la contraseña y lo promovemos a admin activo.
      update: { password: hashedPassword, role: 'admin', status: 'active' },
      create: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone: '0000000000',
        address: 'N/A',
        city: 'N/A',
        state: 'N/A',
        zip: '0000',
        country: 'Venezuela',
        role: 'admin',
        status: 'active',
      },
      select: { id: true, email: true, role: true, status: true },
    });

    console.log('✓ Admin listo. Inicia sesión con email + contraseña:');
    console.log(`  email:    ${user.email}`);
    console.log(`  password: ${password}`);
    console.log(`  role:     ${user.role} | status: ${user.status} | id: ${user.id}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})().catch((err) => {
  console.error('✗ No se pudo crear el admin:', err && err.message ? err.message : err);
  process.exit(1);
});
