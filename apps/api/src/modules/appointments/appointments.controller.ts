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
import { AppointmentsService } from './appointments.service';
import {
  BookAppointmentDto,
  ConfirmAppointmentDto,
  CancelAppointmentDto,
  RescheduleAppointmentDto,
  QueryAppointmentsDto,
} from './dto/appointments.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Roles(
    UserRole.SCHEDULER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Book appointment with Nurse Practitioner assignment' })
  @ApiResponse({ status: 201, description: 'Appointment booked' })
  async bookAppointment(
    @Body() dto: BookAppointmentDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.appointmentsService.bookAppointment(dto, user);
  }

  @Get()
  @Roles(
    UserRole.SCHEDULER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.OFFICE_MANAGER,
    UserRole.BILLING_COORDINATOR,
    UserRole.INTAKE_SPECIALIST,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'List and query scheduled appointments' })
  @ApiResponse({ status: 200, description: 'Paginated appointments list' })
  async findAll(
    @Query() query: QueryAppointmentsDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.appointmentsService.findAll(query, user);
  }

  @Get(':id')
  @Roles(
    UserRole.SCHEDULER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.OFFICE_MANAGER,
    UserRole.BILLING_COORDINATOR,
    UserRole.INTAKE_SPECIALIST,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Get appointment details by ID' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment details' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.appointmentsService.findById(id, user);
  }

  @Patch(':id/confirm')
  @Roles(
    UserRole.SCHEDULER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Confirm appointment and transition referral to NP_VISIT stage' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment confirmed and referral advanced' })
  async confirmAppointment(
    @Param('id') id: string,
    @Body() dto: ConfirmAppointmentDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.appointmentsService.confirmAppointment(id, dto, user);
  }

  @Patch(':id/cancel')
  @Roles(
    UserRole.SCHEDULER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Cancel appointment with reason and put referral on hold' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment cancelled' })
  async cancelAppointment(
    @Param('id') id: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.appointmentsService.cancelAppointment(id, dto, user);
  }

  @Post(':id/reschedule')
  @Roles(
    UserRole.SCHEDULER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Reschedule appointment, linking new booking to previous record' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 201, description: 'New appointment created and old one cancelled' })
  async rescheduleAppointment(
    @Param('id') id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.appointmentsService.rescheduleAppointment(id, dto, user);
  }
}
