import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ClinicalReviewService } from './clinical-review.service';
import {
  CreateClinicalReviewDto,
  QueryClinicalReviewsDto,
} from './dto/clinical-review.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';

@ApiTags('Clinical Review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clinical-reviews')
export class ClinicalReviewController {
  constructor(private readonly reviewService: ClinicalReviewService) {}

  @Post()
  @Roles(UserRole.CLINICAL_REVIEWER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Submit clinical review decision (ACCEPT, RETURN, REJECT) with atomic state transition' })
  @ApiResponse({ status: 201, description: 'Clinical review recorded and pipeline advanced' })
  @ApiResponse({ status: 400, description: 'Referral not in clinical review stage or missing reason' })
  async createReview(
    @Body() dto: CreateClinicalReviewDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.reviewService.createReview(dto, user);
  }

  @Get()
  @Roles(
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.INTAKE_SPECIALIST,
    UserRole.OFFICE_MANAGER,
    UserRole.SCHEDULER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'List and query clinical reviews' })
  @ApiResponse({ status: 200, description: 'List of clinical review records' })
  async findAll(
    @Query() query: QueryClinicalReviewsDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.reviewService.findAll(query, user);
  }

  @Get('referral/:referralId')
  @Roles(
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.INTAKE_SPECIALIST,
    UserRole.OFFICE_MANAGER,
    UserRole.SCHEDULER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Get full clinical review decision history for a referral' })
  @ApiParam({ name: 'referralId', description: 'Referral UUID' })
  @ApiResponse({ status: 200, description: 'Chronological review history' })
  async findByReferralId(
    @Param('referralId') referralId: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.reviewService.findByReferralId(referralId, user);
  }

  @Get(':id')
  @Roles(
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.INTAKE_SPECIALIST,
    UserRole.OFFICE_MANAGER,
    UserRole.SCHEDULER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Get clinical review by ID' })
  @ApiParam({ name: 'id', description: 'Review UUID' })
  @ApiResponse({ status: 200, description: 'Clinical review details' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.reviewService.findById(id, user);
  }
}
