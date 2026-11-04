import { Module } from '@nestjs/common';
import { MealReportService } from './meal-report.service';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';

@Module({
  controllers: [MealsController],
  providers: [MealsService, MealReportService],
})
export class MealsModule {}
