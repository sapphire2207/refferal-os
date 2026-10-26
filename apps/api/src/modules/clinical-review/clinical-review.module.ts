import { Module } from '@nestjs/common';
import { ClinicalReviewController } from './clinical-review.controller';
import { ClinicalReviewService } from './clinical-review.service';

@Module({
  controllers: [ClinicalReviewController],
  providers: [ClinicalReviewService],
  exports: [ClinicalReviewService],
})
export class ClinicalreviewModule {}
