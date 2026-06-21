import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../users/decorators/auth.decorators';
import { ValidRoles } from '../users/interfaces';

/**
 * Diagnósticos del servicio en ejecución (solo admin).
 */
@ApiTags('Health')
@ApiBearerAuth()
@Controller('health')
export class HealthController {
  @Get('egress-ip')
  @Auth(ValidRoles.admin)
  @ApiOperation({
    summary:
      '[Admin] IP pública de SALIDA de esta instancia (la que ve el banco R4). Con Cloud NAT debe ser siempre la IP fija reservada.',
  })
  async egressIp() {
    // La instancia viva pregunta a un servicio externo desde qué IP la ve
    // llegar: es la prueba definitiva de que el egress sale por el NAT.
    try {
      const res = await fetch('https://ifconfig.me', {
        headers: { Accept: 'text/plain' },
        signal: AbortSignal.timeout(10000),
      });
      const ip = (await res.text()).trim();
      return { egressIp: ip, checkedAt: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo consultar la IP de salida (¿sin salida a internet? revisar VPC/NAT)',
      );
    }
  }
}
