import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto, StockOperation } from './dto/adjust-stock.dto';
import { FilterProductsDto, ProductSort } from './dto/filter-products.dto';
import { PrismaService } from '../database/database.service';
import { buildOrderBy } from '../common/sort/build-order-by';
import { canAccessVisibility, PUBLIC_VISIBILITIES } from '../common/account.constants';
import { BulkImportDto } from '../common/dto/bulk-import.dto';
import {
  runBulkImport,
  validateAgainstDto,
  type BulkResult,
} from '../common/bulk/bulk-import.helper';
import { compactRow } from '../common/bulk/compact-row';

// Quién consulta el catálogo. null = invitado. El admin (role) ve todo; un B2B
// (accountType) ve además los WHOLESALE_ONLY. Lo pasa el controller desde el token.
export type ProductViewer = { role?: string; accountType?: string } | null;

// Nombres de atributo que se consideran "tueste"/"origen". El catálogo guarda
// estas características como ProductAttribute libres (name/value), así que el
// filtro acepta varias convenciones de nombre para ser tolerante con los datos.
const ROAST_ATTR_NAMES = ['roast', 'tueste', 'tostado'];
const ORIGIN_ATTR_NAMES = ['origin', 'origen', 'procedencia'];

// Columnas ordenables desde la tabla del admin (cabeceras clickeables). La clave
// es la que envía el front (?sortBy=); el valor traduce a un orderBy de Prisma.
const PRODUCT_SORT_COLUMNS: Record<
  string,
  (dir: Prisma.SortOrder) => Prisma.ProductOrderByWithRelationInput
> = {
  name: (dir) => ({ name: dir }),
  category: (dir) => ({ category: { name: dir } }),
  price: (dir) => ({ price: dir }),
  // Solo lo usa la tabla del admin (el catálogo público no expone `cost`).
  cost: (dir) => ({ cost: dir }),
  stock: (dir) => ({ stock: dir }),
  points: (dir) => ({ pointsPrice: dir }),
  // Ordena alfabéticamente: ALL < RETAIL_ONLY < WHOLESALE_ONLY.
  visibility: (dir) => ({ visibility: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) { }

  // Los relacionados se filtran con la MISMA regla de visibilidad que el catálogo
  // (visibilityWhere): si no, un producto WHOLESALE_ONLY aparecería como
  // "relacionado" para un B2C/invitado y su detalle daría 404 al entrar.
  private productInclude(viewer?: ProductViewer) {
    const visibility = this.visibilityWhere(viewer);
    return {
      category: true,
      attributes: true,
      variants: true,
      productTags: {
        include: { tag: true },
      },
      relatedProducts: {
        ...(visibility ? { where: { related: visibility } } : {}),
        include: {
          related: {
            select: {
              id: true,
              name: true,
              price: true,
              mainImage: true,
            },
          },
        },
      },
    } satisfies Prisma.ProductInclude;
  }

  create(createProductDto: CreateProductDto) {
    const { tagIds, attributes, variants, categoryId, relatedProducts, ...productData } =
      createProductDto;

    return this.prisma.product.create({
      data: {
        ...productData,
        images: productData.images ?? [],
        ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
        productTags: tagIds?.length
          ? { create: tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) }
          : undefined,
        attributes: attributes?.length
          ? { create: attributes }
          : undefined,
        variants: variants?.length
          ? { create: variants }
          : undefined,
        relatedProducts: relatedProducts?.length
          ? { create: relatedProducts.map(({ relatedId, relationType }) => ({ relatedId, relationType })) }
          : undefined,
      },
      include: this.productInclude(),
    });
  }

  // `cost` es admin-only: se omite de la respuesta salvo que el visor sea admin.
  // (Las llamadas internas sin viewer también lo omiten; el costo se lee con selects
  // dedicados en checkout/finanzas, nunca por esta vía.)
  private costOmit(viewer?: ProductViewer) {
    return viewer?.role === 'admin' ? undefined : ({ cost: true } as const);
  }

  async findAll(filters: FilterProductsDto, viewer?: ProductViewer) {
    const { limit, offset } = filters;
    // Búsqueda por texto (q): se resuelve aparte para poder ignorar acentos con
    // `unaccent` (Postgres) y se inyecta como `id IN (...)` en el WHERE, de modo
    // que se combine con el resto de filtros y la paginación sin duplicar lógica.
    const searchIds = filters.q ? await this.searchProductIds(filters.q) : undefined;
    const where = this.buildWhere(filters, viewer, searchIds);
    // El admin ordena por columna (sortBy/order); el catálogo público usa el
    // enum `sort`. Si llega sortBy se prioriza; si no, se aplica el orden por
    // defecto derivado de `sort`.
    const orderBy = buildOrderBy(
      filters.sortBy,
      filters.order,
      PRODUCT_SORT_COLUMNS,
      this.buildOrderBy(filters.sort),
    );

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: this.productInclude(viewer),
        omit: this.costOmit(viewer),
        orderBy,
        take: limit,
        skip: offset,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data, total, limit, offset };
  }

  // IDs de productos cuyo nombre o descripción contienen `q` ignorando MAYÚSCULAS
  // y ACENTOS ("etiopia" encuentra "Etiopía"). Se sanea el término: se recorta, se
  // colapsan espacios y se quitan los comodines de LIKE (% _ \) para que no alteren
  // la búsqueda. Usa la extensión `unaccent` (ver sql/enable_unaccent.sql). El
  // término viaja como parámetro ($queryRaw), así que no hay inyección SQL.
  private async searchProductIds(q: string): Promise<string[]> {
    const cleaned = q.trim().replace(/\s+/g, ' ').replace(/[%_\\]/g, '');
    if (!cleaned) return [];
    const term = `%${cleaned}%`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM products
      WHERE unaccent(lower(name)) LIKE unaccent(lower(${term}))
         OR unaccent(lower(coalesce(description, ''))) LIKE unaccent(lower(${term}))
    `;
    return rows.map((r) => r.id);
  }

  // Traduce los filtros del catálogo a un WHERE de Prisma. Cada criterio se
  // acumula en un AND para que se combinen sin pisarse entre sí (p. ej. tueste
  // y origen, que ambos consultan la relación `attributes`).
  private buildWhere(
    filters: FilterProductsDto,
    viewer?: ProductViewer,
    searchIds?: string[],
  ): Prisma.ProductWhereInput {
    const AND: Prisma.ProductWhereInput[] = [];

    // Visibilidad por segmento (no aplica al admin, que ve todo). Se omite cuando
    // viewer es undefined (llamadas internas de confianza).
    const visibility = this.visibilityWhere(viewer);
    if (visibility) AND.push(visibility);

    // Búsqueda por texto: `searchIds` son los IDs que casaron por `unaccent` LIKE
    // (insensible a mayúsculas y acentos). Si no hubo coincidencias → lista vacía.
    if (filters.q) {
      AND.push({ id: { in: searchIds ?? [] } });
    }

    if (filters.categoryId) {
      AND.push({ categoryId: filters.categoryId });
    }

    const price = this.range(filters.minPrice, filters.maxPrice);
    if (price) AND.push({ price });

    // Filtro por tamaño de bolsa (kg): coincidencia exacta múltiple (chips).
    if (filters.weights?.length) AND.push({ weightKg: { in: filters.weights } });

    const points = this.range(filters.minPoints, filters.maxPoints);
    if (points) AND.push({ pointsPrice: points });

    if (filters.inStock) {
      AND.push({ stock: { gt: 0 } });
    }

    if (filters.roast) {
      AND.push({
        attributes: {
          some: {
            name: { in: ROAST_ATTR_NAMES, mode: 'insensitive' },
            value: { equals: filters.roast, mode: 'insensitive' },
          },
        },
      });
    }

    if (filters.origin) {
      AND.push({
        attributes: {
          some: {
            name: { in: ORIGIN_ATTR_NAMES, mode: 'insensitive' },
            value: { equals: filters.origin, mode: 'insensitive' },
          },
        },
      });
    }

    if (filters.tag) {
      AND.push({ productTags: { some: { tag: { slug: filters.tag } } } });
    }

    return AND.length ? { AND } : {};
  }

  // Construye un filtro de rango numérico solo con los extremos definidos.
  // Devuelve undefined si no hay ningún límite, para no añadir un WHERE vacío.
  private range(min?: number, max?: number) {
    if (min === undefined && max === undefined) return undefined;
    return {
      ...(min !== undefined ? { gte: min } : {}),
      ...(max !== undefined ? { lte: max } : {}),
    };
  }

  private buildOrderBy(
    sort?: ProductSort,
  ): Prisma.ProductOrderByWithRelationInput {
    switch (sort) {
      case ProductSort.PRICE_ASC:
        return { price: 'asc' };
      case ProductSort.PRICE_DESC:
        return { price: 'desc' };
      case ProductSort.NAME_ASC:
        return { name: 'asc' };
      case ProductSort.NAME_DESC:
        return { name: 'desc' };
      case ProductSort.OLDEST:
        return { createdAt: 'asc' };
      case ProductSort.NEWEST:
      case ProductSort.FEATURED:
      default:
        return { createdAt: 'desc' };
    }
  }

  // Predicado de visibilidad para el catálogo según el visor.
  //   · undefined          → llamada interna de confianza (sin filtro).
  //   · role === 'admin'   → ve todo (sin filtro).
  //   · accountType B2B    → ve todo (los productos B2C son públicos) → sin filtro.
  //   · resto (B2C/invitado) → SOLO las visibilidades públicas (whitelist). Se usa
  //     `in` y no `not: 'WHOLESALE_ONLY'` para fallar cerrado: cualquier valor de
  //     `visibility` inesperado queda oculto en vez de filtrarse al público.
  private visibilityWhere(viewer?: ProductViewer): Prisma.ProductWhereInput | null {
    if (viewer === undefined) return null;
    if (viewer?.role === 'admin') return null;
    if (viewer?.accountType === 'B2B') return null;
    return { visibility: { in: [...PUBLIC_VISIBILITIES] } };
  }

  async findOne(id: string, viewer?: ProductViewer) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.productInclude(viewer),
      omit: this.costOmit(viewer),
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    // Un producto no visible para el visor se trata como inexistente (404), para
    // no filtrar productos exclusivos por id directo. El admin (viewer.role) y las
    // llamadas internas (viewer undefined) lo omiten.
    if (
      viewer !== undefined &&
      viewer?.role !== 'admin' &&
      !canAccessVisibility(viewer?.accountType, product.visibility)
    ) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    await this.findOne(id);

    // `stock` se ignora aquí a propósito: en productos existentes solo se modifica
    // mediante adjustStock() (operación atómica add/subtract) para evitar pisar
    // cambios concurrentes. Ver PATCH /products/:id/stock.
    const { tagIds, attributes, variants, categoryId, relatedProducts, stock: _stock, ...productData } =
      updateProductDto;

    return this.prisma.product.update({
      where: { id },
      data: {
        ...productData,
        ...(categoryId === undefined
          ? {}
          : categoryId
            ? { category: { connect: { id: categoryId } } }
            : { category: { disconnect: true } }),
        productTags: tagIds
          ? {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })),
          }
          : undefined,
        attributes: attributes
          ? { deleteMany: {}, create: attributes }
          : undefined,
        variants: variants
          ? { deleteMany: {}, create: variants }
          : undefined,
        relatedProducts: relatedProducts
          ? {
            deleteMany: {},
            create: relatedProducts.map(({ relatedId, relationType }) => ({
              relatedId,
              relationType,
            })),
          }
          : undefined,
      },
      include: this.productInclude(),
    });
  }

  // Ajuste relativo y atómico del stock. No lee-y-pisa: usa increment/decrement
  // a nivel de base de datos, por lo que es seguro ante operaciones concurrentes
  // (p. ej. una compra que descuenta stock al mismo tiempo).
  async adjustStock(id: string, { operation, quantity }: AdjustStockDto) {
    if (operation === StockOperation.ADD) {
      try {
        return await this.prisma.product.update({
          where: { id },
          data: { stock: { increment: quantity } },
          include: this.productInclude(),
        });
      } catch {
        throw new NotFoundException(`Product with id ${id} not found`);
      }
    }

    // SUBTRACT — solo descuenta si hay stock suficiente. La condición `stock >= quantity`
    // viaja en el WHERE, así que la verificación y la resta son una sola operación atómica.
    const result = await this.prisma.product.updateMany({
      where: { id, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });

    if (result.count === 0) {
      // O el producto no existe, o no hay stock suficiente. Distinguimos ambos casos.
      const fresh = await this.prisma.product.findUnique({
        where: { id },
        select: { stock: true },
      });
      if (!fresh) {
        throw new NotFoundException(`Product with id ${id} not found`);
      }
      throw new BadRequestException(
        `Stock insuficiente: hay ${fresh.stock} unidades y se intentan restar ${quantity}`,
      );
    }

    // Devolvemos con el costo incluido (endpoint admin-only).
    return this.findOne(id, { role: 'admin' });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.product.delete({ where: { id } });
  }

  // Importación masiva desde CSV. El catálogo no tiene un campo único natural
  // (el `name` puede repetirse), así que para resolver duplicados se usa la
  // columna `id` si viene en el archivo (la exportación la incluye); si no, se
  // intenta casar por `name`. Las relaciones complejas (atributos, variantes,
  // productos relacionados) no se importan por CSV. En modo update el stock no
  // se toca (se ajusta sólo vía adjustStock), igual que en la edición normal.
  async bulkImport({ mode, rows }: BulkImportDto): Promise<BulkResult> {
    type ProductRow = { dto: CreateProductDto; id?: string };

    return runBulkImport<ProductRow>(rows, mode, {
      prepare: async (raw) => {
        const dto = await validateAgainstDto(
          CreateProductDto,
          compactRow({
            name: raw.name,
            description: raw.description,
            price: raw.price,
            offerPrice: raw.offerPrice,
            cost: raw.cost,
            weightKg: raw.weightKg,
            visibility: raw.visibility,
            mainImage: raw.mainImage,
            images: raw.images,
            stock: raw.stock,
            categoryId: raw.categoryId,
            tagIds: raw.tagIds,
            pointsPrice: raw.pointsPrice,
            pointsEarned: raw.pointsEarned,
          }) as Record<string, unknown>,
        );
        const id =
          typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined;
        return { dto, id };
      },
      findExisting: ({ dto, id }) =>
        id
          ? this.prisma.product.findUnique({ where: { id } })
          : this.prisma.product.findFirst({ where: { name: dto.name } }),
      create: ({ dto }) => this.create(dto),
      update: (existing, { dto }) =>
        this.update((existing as { id: string }).id, dto),
    });
  }
}
