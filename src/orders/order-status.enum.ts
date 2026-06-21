// Estados del ciclo de vida (fulfillment) de un pedido:
//   PENDING    → recién creado / por procesar
//   PREPARING  → pago confirmado, preparándose (o el admin lo inició)
//   SENDING    → en reparto ("Enviando")
//   COMPLETED  → entregado Y pagado (estado terminal exitoso)
//   CANCELLED  → cancelado
//
// A nivel de BASE DE DATOS, `orders.status` es un VARCHAR(50) libre (NO un enum
// físico de Postgres): así podemos añadir estados futuros sin migraciones de
// enum. Este enum de TypeScript es la fuente de verdad del conjunto válido y se
// usa para validar (class-validator @IsEnum) y para comparar/escribir estados en
// el código. El "pagado" como tal NO es un estado de orden: vive en
// `Payment.status` (PENDING|PROCESSING|COMPLETED|FAILED|REFUNDED).
export enum OrderStatus {
  PENDING = 'PENDING',
  PREPARING = 'PREPARING',
  SENDING = 'SENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
