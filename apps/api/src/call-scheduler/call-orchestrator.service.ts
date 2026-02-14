import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { CallsService } from '../calls/calls.service';
import { MedicinesService } from '../medicines/medicines.service';
import { PatientsService } from '../patients/patients.service';
import { TwilioService } from '../integrations/twilio/twilio.service';
import { ElevenLabsService } from '../integrations/elevenlabs/elevenlabs.service';
import { NotificationsService } from '../notifications/notifications.service';

interface DueCall {
  config: any;
  patient: any;
  timing: string;
}

@Injectable()
export class CallOrchestratorService {
  private readonly logger = new Logger(CallOrchestratorService.name);
  private readonly MAX_CONCURRENT = 50;

  constructor(
    private callsService: CallsService,
    private medicinesService: MedicinesService,
    private patientsService: PatientsService,
    private twilioService: TwilioService,
    private elevenLabsService: ElevenLabsService,
    private notificationsService: NotificationsService,
  ) {}

  async processBatch(dueCalls: DueCall[]) {
    // Process in batches to respect Twilio limits
    const batches = [];
    for (let i = 0; i < dueCalls.length; i += this.MAX_CONCURRENT) {
      batches.push(dueCalls.slice(i, i + this.MAX_CONCURRENT));
    }

    for (const batch of batches) {
      await Promise.allSettled(batch.map((dc) => this.initiateCall(dc)));
    }
  }

  async initiateCall(dueCall: DueCall) {
    const { config, patient, timing } = dueCall;

    try {
      // Get medicines for this timing
      const medicines = await this.medicinesService.findByPatientAndTiming(
        patient._id.toString(),
        timing,
      );

      if (medicines.length === 0) {
        this.logger.log(`No ${timing} medicines for patient ${patient._id}, skipping`);
        return;
      }

      // Create call record
      const call = await this.callsService.create({
        patientId: patient._id,
        userId: patient.userId,
        scheduledAt: new Date(),
        status: 'scheduled',
        isFirstCall: patient.callsCompletedCount === 0,
        usedNewPatientProtocol: patient.isNewPatient,
        medicinesChecked: medicines.map((med) => ({
          medicineId: med._id,
          medicineName: med.brandName,
          nickname: med.nicknames[0] || med.brandName,
          response: 'pending',
          timestamp: new Date(),
        })),
      });

      // Generate conversation script
      const script = this.generateScript(patient, medicines);

      // Generate audio via ElevenLabs
      const voiceId = patient.preferredVoiceGender === 'male'
        ? process.env.ELEVENLABS_VOICE_ID_MALE
        : process.env.ELEVENLABS_VOICE_ID_FEMALE;

      const audioUrl = await this.elevenLabsService.generateSpeech(
        script.greeting,
        voiceId,
        { speed: patient.isNewPatient ? 0.85 : 1.0 },
      );

      // Place call via Twilio
      const twilioCall = await this.twilioService.makeCall(
        patient.phone,
        audioUrl,
        call._id.toString(),
      );

      // Update call with Twilio SID
      await this.callsService.updateCallStatus(call._id.toString(), 'in_progress', {
        twilioCallSid: twilioCall.sid,
        initiatedAt: new Date(),
      });

      this.logger.log(`Call initiated for patient ${patient.preferredName} (${patient._id})`);
    } catch (error) {
      this.logger.error(
        `Failed to initiate call for patient ${patient._id}: ${error.message}`,
      );
    }
  }

  async handleCallCompleted(callId: string, data: any) {
    const call = await this.callsService.updateCallStatus(callId, 'completed', {
      endedAt: new Date(),
      duration: data.duration,
      twilioCharges: data.price,
    });

    const patient = await this.patientsService.findById(call.patientId.toString());

    // Track first call and increment count
    await this.patientsService.setFirstCallAt(patient._id.toString());
    await this.patientsService.incrementCallCount(patient._id.toString());

    // Send immediate post-call WhatsApp report to payer
    await this.notificationsService.sendPostCallReport(call, patient);

    this.logger.log(`Call completed for patient ${patient.preferredName}, duration: ${data.duration}s`);
  }

  async handleCallFailed(callId: string, status: string, errorCode?: string) {
    await this.callsService.updateCallStatus(callId, status);

    if (errorCode === '21217') {
      // Invalid phone number
      const call = await this.callsService.findById(callId);
      const patient = await this.patientsService.findById(call.patientId.toString());
      await this.patientsService.update(patient._id.toString(), patient.userId.toString(), {
        isPaused: true,
        pauseReason: 'invalid_phone',
      } as any);

      await this.notificationsService.sendInvalidPhoneAlert(call, patient);
    }
  }

  private generateScript(patient: any, medicines: any[]) {
    const greeting = patient.isNewPatient
      ? `Namaste ${patient.preferredName}! Main Health Discipline AI se bol raha hoon. Aapke ${patient.userId} ne yeh seva shuru ki hai. Kya aap theek hain?`
      : `Namaste ${patient.preferredName}! Aap kaisi feel kar rahe hain aaj?`;

    const medicineQuestions = medicines.map((med) => {
      const name = med.nicknames[0] || med.brandName;
      return `${name} li kya ${med.timing} mein?`;
    });

    return {
      greeting,
      medicineQuestions,
      vitalsPrompt: patient.hasGlucometer || patient.hasBPMonitor
        ? 'Kya aapne aaj sugar ya BP check kiya?'
        : null,
      moodCheck: 'Aap kaisi feel kar rahe hain?',
      closing: `Bahut accha ${patient.preferredName}! Apna khayal rakhiye. Kal phir baat karenge.`,
    };
  }
}
