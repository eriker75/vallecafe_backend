// DTO laxo para la consulta de R4. Igual que el de notificación: sin
// decoradores; el cuerpo se lee crudo en el controlador.
export interface R4WebhookConsultaDto {
  IdCliente?: string;
  Monto?: string | number;
  TelefonoComercio?: string;
  [key: string]: any;
}
