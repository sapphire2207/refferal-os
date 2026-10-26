import {
  Controller,
  Get,
  Post,
  Patch,
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
import { NotificationsService } from './notifications.service';
import {
  SendNotificationDto,
  QueryNotificationsDto,
} from './dto/notifications.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current authenticated user' })
  @ApiResponse({ status: 200, description: 'Paginated user notifications' })
  async getUserNotifications(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.notificationsService.getUserNotifications(user.userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread notifications count for header badge' })
  @ApiResponse({ status: 200, description: 'Count of unread notifications' })
  async getUnreadCount(@CurrentUser() user: AuthTokenPayload) {
    return this.notificationsService.getUnreadCount(user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification marked read' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.notificationsService.markAsRead(id, user.userId);
  }

  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all unread notifications as read for current user' })
  @ApiResponse({ status: 200, description: 'All notifications marked read' })
  async markAllAsRead(@CurrentUser() user: AuthTokenPayload) {
    return this.notificationsService.markAllAsRead(user.userId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CLINICAL_COORDINATOR)
  @ApiOperation({ summary: 'Dispatch operational or system notification (Admin/Coordinator only)' })
  @ApiResponse({ status: 201, description: 'Notification sent' })
  async sendNotification(@Body() dto: SendNotificationDto) {
    return this.notificationsService.sendNotification(dto);
  }
}
