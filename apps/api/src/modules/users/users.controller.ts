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
  ForbiddenException,
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
import { UsersService } from './users.service';
import {
  CreateUserInviteDto,
  UpdateUserRolesDto,
  UpdateUserScopesDto,
  UpdateUserStatusDto,
  UpdateUserProfileDto,
  QueryUsersDto,
} from './dto/users.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';
import { DistributedRateLimiterService } from '../../common/services/rate-limiter.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rateLimiter: DistributedRateLimiterService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CLINICAL_COORDINATOR, UserRole.OFFICE_MANAGER)
  @ApiOperation({ summary: 'List and search users with role and scope filters' })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  async findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile with roles and scopes' })
  async getProfile(@CurrentUser() user: AuthTokenPayload) {
    return this.usersService.findById(user.userId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CLINICAL_COORDINATOR, UserRole.OFFICE_MANAGER)
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User profile with roles and scopes' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post('invite')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Invite a new user to the platform (Admin only)' })
  @ApiResponse({ status: 201, description: 'User invited with 7-day token generated' })
  @ApiResponse({ status: 409, description: 'User with email already exists and active' })
  async inviteUser(
    @Body() dto: CreateUserInviteDto,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: Request,
  ) {
    await this.rateLimiter.enforce('auth-login', req.ip || 'admin');
    return this.usersService.inviteUser(dto, user.userId);
  }

  @Patch(':id/roles')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user assigned roles (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Roles updated and permission caches invalidated' })
  async updateRoles(
    @Param('id') id: string,
    @Body() dto: UpdateUserRolesDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.usersService.updateRoles(id, dto, user.userId);
  }

  @Patch(':id/scopes')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user location & legal entity scopes (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Scopes updated successfully' })
  async updateScopes(
    @Param('id') id: string,
    @Body() dto: UpdateUserScopesDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.usersService.updateScopes(id, dto, user.userId);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user status: activate, suspend, or unsuspend (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Status updated, sessions terminated if suspended/deactivated' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.usersService.updateStatus(id, dto, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile (Self or Admin)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserProfileDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    // Only admins or the user themselves can update their profile
    const isAdmin = user.roles?.includes(UserRole.ADMIN);
    if (!isAdmin && user.userId !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }

    return this.usersService.updateProfile(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete user account or cancel pending invite (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User deleted or access revoked' })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.usersService.deleteUser(id, user.userId);
  }

  async deactivateUser(id: string, user: AuthTokenPayload) {
    return this.usersService.deactivateUser(id, user.userId);
  }

  @Post(':id/resend-invite')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Resend invitation email with refreshed 7-day token (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Invitation email resent' })
  async resendInvite(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.usersService.resendInvite(id, user.userId);
  }
}
