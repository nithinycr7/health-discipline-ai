import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { TwilioService } from '../integrations/twilio/twilio.service';
import { ElevenLabsService } from '../integrations/elevenlabs/elevenlabs.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private twilioService: TwilioService,
    private elevenLabsService: ElevenLabsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const [twilio, elevenlabs] = await Promise.all([
      this.twilioService.healthCheck(),
      this.elevenLabsService.healthCheck(),
    ]);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { twilio, elevenlabs },
    };
  }
}
