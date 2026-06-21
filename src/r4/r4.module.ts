import { Module } from '@nestjs/common';
import { R4ConectaService } from './r4-conecta.service';

// Cliente del API R4 Conecta (Mi Banco). Lo consumen PaymentsModule (débito
// inmediato) y BcvModule (tasa BCV oficial vía banco).
@Module({
  providers: [R4ConectaService],
  exports: [R4ConectaService],
})
export class R4Module {}
