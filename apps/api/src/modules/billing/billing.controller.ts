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
import { BillingService } from './billing.service';
import {
  CreateClaimDto,
  SubmitClaimDto,
  AdjudicateClaimDto,
  QueryClaimsDto,
} from './dto/billing.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';

@ApiTags('Billing & Claims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('readiness/:referralId')
  @Roles(
    UserRole.BILLING_COORDINATOR,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Validate billing qualification and stage prerequisites' })
  @ApiParam({ name: 'referralId', description: 'Referral UUID' })
  @ApiResponse({ status: 200, description: 'Billing readiness evaluation and blockers list' })
  async validateReadiness(
    @Param('referralId') referralId: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.billingService.validateBillingReadiness(referralId, user);
  }

  @Post('claims')
  @Roles(UserRole.BILLING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create claim record from billing-ready referral' })
  @ApiResponse({ status: 201, description: 'Claim record generated' })
  @ApiResponse({ status: 400, description: 'Referral not billing-ready' })
  async createClaim(
    @Body() dto: CreateClaimDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.billingService.createClaim(dto, user);
  }

  @Get('claims')
  @Roles(
    UserRole.BILLING_COORDINATOR,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'List and search insurance claims' })
  @ApiResponse({ status: 200, description: 'Paginated claims list' })
  async findAllClaims(
    @Query() query: QueryClaimsDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.billingService.findAllClaims(query, user);
  }

  @Get('claims/:id')
  @Roles(
    UserRole.BILLING_COORDINATOR,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Get claim details by ID' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({ status: 200, description: 'Claim details' })
  @ApiResponse({ status: 404, description: 'Claim not found' })
  async findClaimById(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.billingService.findClaimById(id, user);
  }

  @Post('claims/:id/submit')
  @Roles(UserRole.BILLING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Submit claim to clearinghouse / payer with duplicate safeguard' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({ status: 200, description: 'Claim submitted and reference generated' })
  @ApiResponse({ status: 400, description: 'Claim already submitted' })
  async submitClaim(
    @Param('id') id: string,
    @Body() dto: SubmitClaimDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.billingService.submitClaim(id, dto, user);
  }

  @Post('claims/:id/adjudicate')
  @Roles(UserRole.BILLING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Record claim adjudication: PAID, DENIED, or REJECTED' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({ status: 200, description: 'Adjudication recorded and referral lifecycle updated' })
  async adjudicateClaim(
    @Param('id') id: string,
    @Body() dto: AdjudicateClaimDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.billingService.adjudicateClaim(id, dto, user);
  }
}
