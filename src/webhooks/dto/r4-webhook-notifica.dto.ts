// DTO laxo para la notificación de abono de R4. R4 envía campos crudos en
// PascalCase; NO lleva decoradores de class-validator a propósito para no
// interferir con el ValidationPipe global. En el controlador se lee el cuerpo
// crudo (@Req() req.body), de modo que `forbidNonWhitelisted` no rechace los
// campos extra ni `whitelist` los descarte.
export interface R4WebhookNotificaDto {
  IdComercio?: string;
  TelefonoComercio?: string;
  TelefonoEmisor?: string;
  Concepto?: string;
  BancoEmisor?: string;
  Monto?: string | number;
  FechaHora?: string;
  Referencia?: string;
  CodigoRed?: string;
  [key: string]: any;
}
