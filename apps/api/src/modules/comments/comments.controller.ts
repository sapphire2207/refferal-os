import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/comments.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';

@ApiTags('Referral Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('referrals/:id/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.OFFICE_MANAGER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'List all internal comments for a referral' })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  @ApiResponse({ status: 200, description: 'List of internal comments' })
  async getComments(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.commentsService.getComments(id, user);
  }

  @Post()
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.OFFICE_MANAGER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Add an internal comment to a referral' })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  @ApiResponse({ status: 201, description: 'Comment created' })
  async createComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.commentsService.createComment(id, dto, user);
  }
}

