import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PatientsService } from './patients.service';
import {
  CreatePatientDto,
  UpdatePatientDto,
  QueryPatientsDto,
  CheckDuplicatePatientDto,
} from './dto/patients.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';
import { DistributedRateLimiterService } from '../../common/services/rate-limiter.service';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly rateLimiter: DistributedRateLimiterService,
  ) {}

  @Get()
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.SCHEDULER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Search and list patients with geographic scope filtering' })
  @ApiResponse({ status: 200, description: 'Paginated patients list' })
  async findAll(
    @Query() query: QueryPatientsDto,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: Request,
  ) {
    await this.rateLimiter.enforce('api-search', req.ip || user.userId);
    return this.patientsService.findAll(query, user);
  }

  @Post('check-duplicates')
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Check candidate demographics for potential duplicate patient records' })
  @ApiResponse({ status: 200, description: 'Array of potential duplicate matches with confidence scores' })
  async checkDuplicates(
    @Body() candidate: CheckDuplicatePatientDto,
    @Req() req: Request,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    await this.rateLimiter.enforce('api-search', req.ip || user.userId);
    return this.patientsService.checkDuplicates(candidate);
  }

  @Get(':id')
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.SCHEDULER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Get patient by ID with full referral history' })
  @ApiParam({ name: 'id', description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'Patient details and referral timeline' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.patientsService.findById(id, user);
  }

  @Post()
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Create new patient record with duplicate checking' })
  @ApiResponse({ status: 201, description: 'Patient record created' })
  @ApiResponse({ status: 409, description: 'Potential duplicate detected' })
  async create(
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.patientsService.create(dto, user);
  }

  @Patch(':id')
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Update patient demographics' })
  @ApiParam({ name: 'id', description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'Patient record updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.patientsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete patient record (Admin only - blocked if active medical referrals exist)' })
  @ApiParam({ name: 'id', description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'Patient deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete patient with active referral history' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.patientsService.delete(id, user);
  }
}
