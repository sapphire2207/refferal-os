import {
  Controller,
  Get,
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
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/audit.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';

@ApiTags('Audit & Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Query audit logs and PHI access events (Admin & Compliance only)' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  async queryLogs(
    @Query() query: QueryAuditLogsDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.auditService.queryLogs(query, user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Get audit log details by ID (Admin & Compliance only)' })
  @ApiParam({ name: 'id', description: 'Audit Event UUID' })
  @ApiResponse({ status: 200, description: 'Audit event record' })
  @ApiResponse({ status: 404, description: 'Audit event not found' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.auditService.findById(id, user);
  }
}
