import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ClinicalreviewModule } from './modules/clinical-review/clinical-review.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { EncountersModule } from './modules/encounters/encounters.module';
import { BillingModule } from './modules/billing/billing.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { CommentsModule } from './modules/comments/comments.module';
import { HealthController } from './health.controller';
import { EmailModule } from './common/email/email.module';

@Module({
  imports: [
    // Task Scheduling
    ScheduleModule.forRoot(),

    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // Core modules
    DatabaseModule,
    RedisModule,
    CommonModule,
    EmailModule,

    // Feature modules
    AuthModule,
    UsersModule,
    PatientsModule,
    ReferralsModule,
    DocumentsModule,
    ClinicalreviewModule,
    AppointmentsModule,
    EncountersModule,
    BillingModule,
    AuditModule,
    NotificationsModule,
    WebsocketModule,
    CommentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
