import { ProductsService } from './products.service';

// El costo del producto (Product.cost) es admin-only y NUNCA debe llegar al cliente.
// Estos tests verifican que findOne/findAll pasan `omit: { cost: true }` a Prisma para
// visores no-admin (invitado, B2C, B2B) y `omit: undefined` solo para el admin.
describe('ProductsService — privacidad del costo', () => {
  const makePrisma = () => {
    const product = {
      findUnique: jest.fn().mockResolvedValue({ id: 'p1', visibility: 'ALL' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    return {
      product,
      // findAll usa $transaction([findMany, count]).
      $transaction: jest.fn((arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as Promise<unknown>),
      ),
    };
  };

  const NON_ADMIN_VIEWERS = [
    undefined,
    null,
    { role: 'customer' },
    { accountType: 'B2C' },
    { accountType: 'B2B' },
  ];

  it('findOne omite el costo para invitado/B2C/B2B', async () => {
    for (const viewer of NON_ADMIN_VIEWERS) {
      const prisma = makePrisma();
      const service = new ProductsService(prisma as never);
      await service.findOne('p1', viewer as never);
      expect(prisma.product.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ omit: { cost: true } }),
      );
    }
  });

  it('findOne incluye el costo (omit undefined) solo para el admin', async () => {
    const prisma = makePrisma();
    const service = new ProductsService(prisma as never);
    await service.findOne('p1', { role: 'admin' } as never);
    expect(prisma.product.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ omit: undefined }),
    );
  });

  it('findAll omite el costo para no-admin e incluye para admin', async () => {
    const nonAdmin = makePrisma();
    await new ProductsService(nonAdmin as never).findAll({ limit: 10, offset: 0 } as never, {
      accountType: 'B2C',
    } as never);
    expect(nonAdmin.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ omit: { cost: true } }),
    );

    const admin = makePrisma();
    await new ProductsService(admin as never).findAll({ limit: 10, offset: 0 } as never, {
      role: 'admin',
    } as never);
    expect(admin.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ omit: undefined }),
    );
  });
});
