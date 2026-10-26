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
  async getDashboardMetrics(@CurrentUser() user: AuthTokenPayload) {
    return this.referralsService.getDashboardMetrics(user);
  }

  /**
   * GET /api/referrals/:id
   * Retrieves single referral by ID with related records.
   */
  @Get(':id')
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
