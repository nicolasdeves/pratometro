import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

/** readinessProbe do Deployment: só responde, sem tocar no banco. */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { ok: true };
  }
}
