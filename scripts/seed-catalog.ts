/**
 * Seed del catálogo público (categorías, etiquetas y productos de ejemplo).
 *
 * Pensado para poblar la base de datos de desarrollo y poder probar la página
 * /productos del frontend con datos reales y filtros funcionando.
 *
 * Ejecutar dentro del contenedor del backend (tiene DATABASE_URL y el cliente
 * de Prisma generado):
 *   docker exec terroir_backend npx ts-node scripts/seed-catalog.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface SeedCategory {
  name: string;
  slug: string;
  image?: string;
}

interface SeedTag {
  name: string;
  slug: string;
}

interface SeedProduct {
  name: string;
  description: string;
  price: number;
  stock: number;
  mainImage: string;
  images: string[];
  pointsPrice: number;
  pointsEarned: number;
  categorySlug: string;
  attributes?: { name: string; value: string }[];
  tags?: string[];
}

const CATEGORIES: SeedCategory[] = [
  { name: 'Café', slug: 'cafe', image: '/coffee-product-1.jpg' },
  { name: 'Bebidas', slug: 'bebidas', image: '/cappuccino.jpg' },
  { name: 'Accesorios', slug: 'accesorios', image: '/coffee-filter.jpg' },
];

const TAGS: SeedTag[] = [
  { name: 'Destacados', slug: 'destacados' },
  { name: 'Más Vendidos', slug: 'mas-vendidos' },
  { name: 'Novedades', slug: 'novedades' },
];

const roast = (value: string) => ({ name: 'roast', value });
const origin = (value: string) => ({ name: 'origin', value });

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Espresso Terroir',
    description: 'Intenso y sofisticado, con notas de chocolate y cacao.',
    price: 5.0,
    stock: 50,
    mainImage: '/products/espresso-terroir.jpg',
    images: ['/products/espresso-terroir.jpg', '/coffee-product-1.jpg', '/ground-coffee.jpg'],
    pointsPrice: 500,
    pointsEarned: 10,
    categorySlug: 'cafe',
    attributes: [roast('dark'), origin('ethiopia')],
    tags: ['destacados', 'mas-vendidos'],
  },
  {
    name: 'Colombia Supremo',
    description: 'Equilibrado y dulce, cuerpo medio con final achocolatado.',
    price: 12.5,
    stock: 80,
    mainImage: '/coffee-product-2.jpg',
    images: ['/coffee-product-2.jpg', '/coffee-origin-1.jpg'],
    pointsPrice: 1250,
    pointsEarned: 25,
    categorySlug: 'cafe',
    attributes: [roast('medium'), origin('colombia')],
    tags: ['destacados', 'mas-vendidos'],
  },
  {
    name: 'Kenya AA',
    description: 'Acidez brillante y notas cítricas, tueste claro de altura.',
    price: 16.9,
    stock: 35,
    mainImage: '/coffee-product-3.jpg',
    images: ['/coffee-product-3.jpg', '/coffee-origin-2.jpg'],
    pointsPrice: 1690,
    pointsEarned: 34,
    categorySlug: 'cafe',
    attributes: [roast('light'), origin('kenya')],
    tags: ['destacados'],
  },
  {
    name: 'Brasil Santos',
    description: 'Suave y aterciopelado, con notas de nuez y caramelo.',
    price: 11.0,
    stock: 90,
    mainImage: '/coffee-product-4.jpg',
    images: ['/coffee-product-4.jpg', '/coffee-origin-3.jpg'],
    pointsPrice: 1100,
    pointsEarned: 22,
    categorySlug: 'cafe',
    attributes: [roast('medium'), origin('brazil')],
    tags: ['mas-vendidos'],
  },
  {
    name: 'Guatemala Antigua',
    description: 'Cuerpo completo con notas de cacao y un toque especiado.',
    price: 15.5,
    stock: 40,
    mainImage: '/coffee-product-5.jpg',
    images: ['/coffee-product-5.jpg', '/philosophy-coffee.jpg'],
    pointsPrice: 1550,
    pointsEarned: 31,
    categorySlug: 'cafe',
    attributes: [roast('dark'), origin('guatemala')],
    tags: ['destacados'],
  },
  {
    name: 'Descafeinado Suave',
    description: 'Todo el sabor sin cafeína, proceso de agua natural.',
    price: 13.9,
    stock: 25,
    mainImage: '/ground-coffee.jpg',
    images: ['/ground-coffee.jpg'],
    pointsPrice: 1390,
    pointsEarned: 28,
    categorySlug: 'cafe',
    attributes: [roast('medium'), origin('colombia')],
    tags: [],
  },
  {
    name: 'Caramel Latte',
    description: 'Espresso, leche vaporizada y caramelo artesanal.',
    price: 5.25,
    stock: 75,
    mainImage: '/products/caramel-latte.jpg',
    images: ['/products/caramel-latte.jpg', '/product-latte.jpg'],
    pointsPrice: 525,
    pointsEarned: 11,
    categorySlug: 'bebidas',
    attributes: [],
    tags: ['destacados', 'mas-vendidos'],
  },
  {
    name: 'Cold Brew Etiopía',
    description: 'Refrescante y afrutado, extraído en frío durante 18 horas.',
    price: 6.0,
    stock: 60,
    mainImage: '/products/cold-brew-etiopia.jpg',
    images: ['/products/cold-brew-etiopia.jpg'],
    pointsPrice: 600,
    pointsEarned: 12,
    categorySlug: 'bebidas',
    attributes: [origin('ethiopia')],
    tags: ['novedades'],
  },
  {
    name: 'Cortado de Miel',
    description: 'Espresso y leche con un toque de miel orgánica local.',
    price: 5.5,
    stock: 45,
    mainImage: '/products/cortado-miel.jpg',
    images: ['/products/cortado-miel.jpg'],
    pointsPrice: 550,
    pointsEarned: 11,
    categorySlug: 'bebidas',
    attributes: [],
    tags: ['novedades'],
  },
  {
    name: 'Cappuccino Clásico',
    description: 'El equilibrio perfecto de espresso, leche y espuma cremosa.',
    price: 4.75,
    stock: 70,
    mainImage: '/cappuccino.jpg',
    images: ['/cappuccino.jpg', '/product-espresso.jpg'],
    pointsPrice: 475,
    pointsEarned: 10,
    categorySlug: 'bebidas',
    attributes: [],
    tags: ['mas-vendidos'],
  },
  {
    name: 'Prensa Francesa 1L',
    description: 'Prensa de vidrio borosilicato para una extracción rica y plena.',
    price: 24.9,
    stock: 30,
    mainImage: '/coffee-filter.jpg',
    images: ['/coffee-filter.jpg'],
    pointsPrice: 2490,
    pointsEarned: 50,
    categorySlug: 'accesorios',
    attributes: [],
    tags: ['novedades'],
  },
  {
    name: 'Molino Manual de Acero',
    description: 'Molino con fresas cónicas de acero, molienda ajustable y uniforme.',
    price: 39.9,
    stock: 20,
    mainImage: '/coffee-process.jpg',
    images: ['/coffee-process.jpg'],
    pointsPrice: 3990,
    pointsEarned: 80,
    categorySlug: 'accesorios',
    attributes: [],
    tags: ['destacados', 'novedades'],
  },
];

async function main() {
  console.log('🌱 Sembrando catálogo…');

  // Limpieza idempotente del catálogo (las relaciones se borran en cascada).
  await prisma.productRelated.deleteMany();
  await prisma.productTag.deleteMany();
  await prisma.productAttribute.deleteMany();
  await prisma.product.deleteMany();

  // Categorías (upsert por slug único).
  const categoryIdBySlug = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const saved = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, image: cat.image },
      create: { name: cat.name, slug: cat.slug, image: cat.image },
    });
    categoryIdBySlug.set(cat.slug, saved.id);
  }
  console.log(`   ✔ ${CATEGORIES.length} categorías`);

  // Etiquetas (upsert por slug único).
  for (const tag of TAGS) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name },
      create: { name: tag.name, slug: tag.slug },
    });
  }
  console.log(`   ✔ ${TAGS.length} etiquetas`);

  // Productos con sus atributos y etiquetas.
  for (const p of PRODUCTS) {
    const categoryId = categoryIdBySlug.get(p.categorySlug);
    await prisma.product.create({
      data: {
        name: p.name,
        description: p.description,
        price: p.price,
        stock: p.stock,
        mainImage: p.mainImage,
        images: p.images,
        pointsPrice: p.pointsPrice,
        pointsEarned: p.pointsEarned,
        ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
        attributes: p.attributes?.length ? { create: p.attributes } : undefined,
        productTags: p.tags?.length
          ? { create: p.tags.map((slug) => ({ tag: { connect: { slug } } })) }
          : undefined,
      },
    });
  }
  console.log(`   ✔ ${PRODUCTS.length} productos`);
  console.log('✅ Catálogo sembrado.');
}

main()
  .catch((e) => {
    console.error('❌ Error sembrando catálogo:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
