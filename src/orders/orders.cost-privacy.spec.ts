import { OrdersService } from './orders.service';

// El costo nunca debe llegar al cliente en las respuestas de orden: ni el snapshot
// del item (OrderItem.costSnapshot) ni el costo del producto anidado (Product.cost).
// El `orderInclude` que sirve tanto al admin como al dueño debe omitir ambos; las
// finanzas leen el costo con queries dedicadas (admin-only).
describe('OrdersService — privacidad del costo', () => {
  const makeService = (findUnique: jest.Mock) => {
    const prisma = { order: { findUnique } };
    return new OrdersService(prisma as never, {} as never, {} as never, {} as never);
  };

  it('findOne omite costSnapshot del item y cost del producto anidado', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'o1', userId: 'u1', items: [] });
    await makeService(findUnique).findOne('o1');

    const arg = findUnique.mock.calls[0][0];
    expect(arg.include.items.omit).toEqual({ costSnapshot: true });
    expect(arg.include.items.include.product.omit).toEqual({ cost: true });
  });

  it('findByUser usa el mismo include que omite el costo', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { order: { findMany } };
    const service = new OrdersService(prisma as never, {} as never, {} as never, {} as never);
    service.findByUser('u1');

    const arg = findMany.mock.calls[0][0];
    expect(arg.include.items.omit).toEqual({ costSnapshot: true });
    expect(arg.include.items.include.product.omit).toEqual({ cost: true });
  });
});
