import {
  Controller, Get, Post, Put, Body, Param, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new patient profile' })
  async create(@CurrentUser('userId') userId: string, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all patients for current user' })
  async findAll(@CurrentUser('userId') userId: string) {
    return this.patientsService.findAllByUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient by ID' })
  async findOne(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.patientsService.findByIdForUser(id, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update patient profile' })
  async update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(id, userId, dto);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause calls for a patient' })
  async pause(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { reason?: string; pausedUntil?: Date },
  ) {
    return this.patientsService.pause(id, userId, body.reason, body.pausedUntil);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume calls for a patient' })
  async resume(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.patientsService.resume(id, userId);
  }

  @Post(':id/family-members')
  @ApiOperation({ summary: 'Add a family member to a patient' })
  async addFamilyMember(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { name: string; phone: string; relationship: string; notificationLevel?: string },
  ) {
    await this.patientsService.findByIdForUser(id, userId);
    return this.patientsService.addFamilyMember(id, userId, body);
  }

  @Get(':id/family-members')
  @ApiOperation({ summary: 'Get family members for a patient' })
  async getFamilyMembers(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.patientsService.findByIdForUser(id, userId);
    return this.patientsService.getFamilyMembers(id);
  }
}
