import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [JwtModule.register({}), AuthModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class WebsocketModule {}
