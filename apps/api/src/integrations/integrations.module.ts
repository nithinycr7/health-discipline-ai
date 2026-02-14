import { Module } from '@nestjs/common';
import { TwilioModule } from './twilio/twilio.module';
import { ElevenLabsModule } from './elevenlabs/elevenlabs.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [TwilioModule, ElevenLabsModule, WhatsAppModule],
  exports: [TwilioModule, ElevenLabsModule, WhatsAppModule],
})
export class IntegrationsModule {}
