import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  UseFilters,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthTokenPayload } from '@heals/types';
import { ReferralsService } from './services/referrals.service';
import { WorkflowService } from './services/workflow.service';
import {
  CreateReferralDto,
  UpdateReferralDto,
  QueryReferralsDto,
} from './dto/referral-crud.dto';
import { TransitionRequestDto } from './dto/transition-request.dto';
import { UpdateWorkStatusDto } from './dto/work-status.dto';
import { AssignmentRequestDto } from './dto/assignment.dto';
import { WorkflowExceptionFilter } from './filters/workflow-exception.filter';

@ApiTags('Referrals')
@ApiBearerAuth()
@Controller('referrals')
@UseGuards(JwtAuthGuard)
@UseFilters(WorkflowExceptionFilter)
export class ReferralsController {
  constructor(
    private readonly referralsService: ReferralsService,
    private readonly workflowService: WorkflowService,
  ) {}

  /**
   * POST /api/referrals
   * Creates a new referral in INTAKE stage.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new referral in INTAKE stage' })
  @ApiResponse({ status: 201, description: 'Referral created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'User lacks scope access for site/state/legalEntity' })
  async create(
    @Body() dto: CreateReferralDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.referralsService.create(dto, user);
  }

  /**
   * GET /api/referrals
   * Lists referrals filtered by query and constrained by user scope.
   */
  @Get()
  @ApiOperation({ summary: 'List referrals with filters and pagination constrained by user scope' })
  @ApiResponse({ status: 200, description: 'Paginated list of referrals' })
  async findMany(
    @Query() query: QueryReferralsDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.referralsService.findMany(query, user);
  }

  /**
   * GET /api/referrals/dashboard/metrics
   * Retrieves cached dashboard metrics aggregated by stage and status within user scope.
   */
  @Get('dashboard/metrics')
  @ApiOperation({ summary: 'Get cached dashboard metrics within user scope' })
  @ApiResponse({ status: 200, description: 'Aggregated dashboard metrics by stage and status' })
  async getDashboardMetrics(@CurrentUser() user: AuthTokenPayload) {
    return this.referralsService.getDashboardMetrics(user);
  }

  /**
   * GET /api/referrals/:id
   * Retrieves single referral by ID with related records.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get referral by ID' })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  @ApiResponse({ status: 200, description: 'Referral details' })
  @ApiResponse({ status: 404, description: 'Referral not found or user lacks scope' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.referralsService.findOne(id, user);
  }

  /**
   * PATCH /api/referrals/:id
   * Updates non-workflow referral fields with optimistic concurrency control.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update non-workflow referral fields with version check' })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  @ApiResponse({ status: 200, description: 'Referral updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: User lacks scope' })
  @ApiResponse({ status: 409, description: 'Version conflict: referral modified by another user' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferralDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.referralsService.update(id, dto, user);
  }

  /**
   * POST /api/referrals/:id/transitions
   * Executes a pipeline stage transition with transactional gate checking and outbox emission.
   */
  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute authoritative pipeline stage transition' })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  @ApiHeader({ name: 'x-idempotency-key', required: false, description: 'Unique idempotency key for network retries' })
  @ApiResponse({ status: 200, description: 'Transition executed successfully' })
  @ApiResponse({ status: 400, description: 'Validation or prerequisite gate check failed' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient action permission or out-of-scope' })
  @ApiResponse({ status: 409, description: 'Version conflict: optimistic concurrency mismatch' })
  async executeTransition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionRequestDto,
    @Headers('x-idempotency-key') headerIdempotencyKey: string | undefined,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    if (headerIdempotencyKey && !dto.idempotencyKey) {
      dto.idempotencyKey = headerIdempotencyKey;
    }
    return this.workflowService.executeTransition(id, dto, user);
  }

  /**
   * PATCH /api/referrals/:id/work-status
   * Updates operational work status independently of pipeline stage.
   */
  @Patch(':id/work-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update operational work status within current stage' })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  @ApiResponse({ status: 200, description: 'Work status updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition path or missing required reason' })
  @ApiResponse({ status: 409, description: 'Version conflict' })
  async updateWorkStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkStatusDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.workflowService.updateWorkStatus(id, dto, user);
  }

  /**
   * POST /api/referrals/:id/assignments
   * Assigns referral to a user or role queue.
   */
  @Post(':id/assignments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign referral to specific user or role queue' })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  @ApiResponse({ status: 200, description: 'Assignment updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid assignment parameters' })
  @ApiResponse({ status: 403, description: 'Forbidden: User lacks assignment permission or target user lacks scope' })
  async assignReferral(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignmentRequestDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.workflowService.assignReferral(id, dto, user);
  }

  /**
   * GET /api/referrals/:id/workflow-history
   * Retrieves chronological workflow transition audit history.
   */
  @Get(':id/workflow-history')
  @ApiOperation({ summary: 'Retrieve full chronological transition audit trail' })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Chronological transition history' })
  @ApiResponse({ status: 403, description: 'Forbidden: User lacks scope access to referral' })
  async getWorkflowHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const pagination = {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };
    return this.workflowService.getWorkflowHistory(id, user, pagination);
  }
}
