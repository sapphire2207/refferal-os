import { Global, Module } from '@nestjs/common';
import { DistributedRateLimiterService } from './services/rate-limiter.service';

@Global()
@Module({
  providers: [DistributedRateLimiterService],
  exports: [DistributedRateLimiterService],
})
export class CommonModule {}
