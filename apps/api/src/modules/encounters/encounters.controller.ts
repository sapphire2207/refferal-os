import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { EncountersService } from './encounters.service';
import {
  CreateEncounterDto,
  CreateClinicalNoteDto,
  UpdateClinicalNoteDto,
  ReviewNoteDto,
  QueryEncountersDto,
} from './dto/encounters.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';

@ApiTags('Encounters & Clinical Notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('encounters')
export class EncountersController {
  constructor(private readonly encountersService: EncountersService) {}

  @Post()
  @Roles(
    UserRole.NURSE_PRACTITIONER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Record mobile clinical encounter / visit outcome' })
  @ApiResponse({ status: 201, description: 'Encounter recorded' })
  async createEncounter(
    @Body() dto: CreateEncounterDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.encountersService.createEncounter(dto, user);
  }

  @Get()
  @Roles(
    UserRole.NURSE_PRACTITIONER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
    UserRole.OFFICE_MANAGER,
    UserRole.BILLING_COORDINATOR,
    UserRole.INTAKE_SPECIALIST,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'List and query clinical encounters' })
  @ApiResponse({ status: 200, description: 'Paginated encounters list' })
  async findAllEncounters(
    @Query() query: QueryEncountersDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.encountersService.findAllEncounters(query, user);
  }

  @Get(':id')
  @Roles(
    UserRole.NURSE_PRACTITIONER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
    UserRole.OFFICE_MANAGER,
    UserRole.BILLING_COORDINATOR,
    UserRole.INTAKE_SPECIALIST,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Get encounter details by ID' })
  @ApiParam({ name: 'id', description: 'Encounter UUID' })
  @ApiResponse({ status: 200, description: 'Encounter details' })
  @ApiResponse({ status: 404, description: 'Encounter not found' })
  async findEncounterById(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.encountersService.findEncounterById(id, user);
  }

  @Post('notes')
  @Roles(UserRole.NURSE_PRACTITIONER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create draft clinical progress note linked to an encounter' })
  @ApiResponse({ status: 201, description: 'Draft note created' })
  async createNote(
    @Body() dto: CreateClinicalNoteDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.encountersService.createNote(dto, user);
  }

  @Get('notes/:id')
  @Roles(
    UserRole.NURSE_PRACTITIONER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
    UserRole.OFFICE_MANAGER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Get clinical note by ID' })
  @ApiParam({ name: 'id', description: 'Clinical Note UUID' })
  @ApiResponse({ status: 200, description: 'Clinical note details' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  async findNoteById(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.encountersService.findNoteById(id, user);
  }

  @Patch('notes/:id')
  @Roles(UserRole.NURSE_PRACTITIONER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update draft clinical note (blocked if already digitally signed)' })
  @ApiParam({ name: 'id', description: 'Clinical Note UUID' })
  @ApiResponse({ status: 200, description: 'Draft note updated' })
  @ApiResponse({ status: 400, description: 'Signed note is immutable' })
  async updateDraftNote(
    @Param('id') id: string,
    @Body() dto: UpdateClinicalNoteDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.encountersService.updateDraftNote(id, dto, user);
  }

  @Post('notes/:id/sign')
  @Roles(UserRole.NURSE_PRACTITIONER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Digitally sign clinical note and advance referral to NOTES_QA stage' })
  @ApiParam({ name: 'id', description: 'Clinical Note UUID' })
  @ApiResponse({ status: 200, description: 'Note digitally signed and pipeline advanced' })
  async signAndSubmitNote(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.encountersService.signAndSubmitNote(id, user);
  }

  @Post('notes/:id/review')
  @Roles(
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
  )
  @ApiOperation({ summary: 'Notes QA Review: Approve to BILLING or Return to NP for correction' })
  @ApiParam({ name: 'id', description: 'Clinical Note UUID' })
  @ApiResponse({ status: 200, description: 'Review recorded and referral stage routed' })
  async reviewNote(
    @Param('id') id: string,
    @Body() dto: ReviewNoteDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    if (dto.reviewNotes && !dto.reason) {
      dto.reason = dto.reviewNotes;
    }
    return this.encountersService.reviewNote(id, dto, user);
  }

  @Post('notes/review')
  @Roles(
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
  )
  @ApiOperation({ summary: 'Notes QA Review by referral: Approve to BILLING or Return to NP' })
  @ApiResponse({ status: 200, description: 'Review recorded and referral stage routed' })
  async reviewNoteByBody(
    @Body() dto: ReviewNoteDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    if (!dto.referralId) {
      throw new BadRequestException('referralId is required for notes/review endpoint');
    }
    if (dto.reviewNotes && !dto.reason) {
      dto.reason = dto.reviewNotes;
    }
    if (dto.reviewNotes && !dto.correctionRequired) {
      dto.correctionRequired = dto.reviewNotes;
    }
    return this.encountersService.reviewNoteByReferral(dto.referralId, dto, user);
  }

  @Post('referrals/:referralId/review')
  @Roles(
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
  )
  @ApiOperation({ summary: 'Notes QA Review for a specific referral' })
  @ApiParam({ name: 'referralId', description: 'Referral UUID' })
  @ApiResponse({ status: 200, description: 'Review recorded and referral stage routed' })
  async reviewReferralNote(
    @Param('referralId') referralId: string,
    @Body() dto: ReviewNoteDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    if (dto.reviewNotes && !dto.reason) {
      dto.reason = dto.reviewNotes;
    }
    if (dto.reviewNotes && !dto.correctionRequired) {
      dto.correctionRequired = dto.reviewNotes;
    }
    return this.encountersService.reviewNoteByReferral(referralId, dto, user);
  }
}
