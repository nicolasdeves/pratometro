import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/jwt-payload';
import { RateLimiter } from '../common/rate-limit';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { FileUpload } from '../meals/meals.service';
import { PlanService } from './plan.service';

const goalSchema = z.object({
  dailyKcalGoal: z
    .number()
    .int()
    .min(800, 'Meta muito baixa')
    .max(6000, 'Meta muito alta')
    .nullable(),
});
type GoalInput = z.infer<typeof goalSchema>;

@Controller()
export class PlanController {
  private readonly aiLimiter = new RateLimiter(30, 60 * 60_000);

  constructor(private readonly plan: PlanService) {}

  @Get('plan')
  async get(@CurrentUser() user: AuthUser) {
    return { plan: await this.plan.get(user.id) };
  }

  @Put('plan')
  @UseInterceptors(FileInterceptor('pdf', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() pdf: (FileUpload & { originalname?: string }) | undefined,
  ) {
    if (!pdf) throw new BadRequestException('Envie o PDF do plano');
    if (pdf.mimetype !== 'application/pdf')
      throw new BadRequestException('O arquivo precisa ser PDF');
    this.aiLimiter.hit(user.id);
    return this.plan.upload(user.id, pdf);
  }

  @Get('plan/pdf')
  async pdf(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const { pdf, fileName } = await this.plan.pdf(user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.end(Buffer.from(pdf));
  }

  @Delete('plan')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser) {
    return this.plan.remove(user.id);
  }

  @Post('meals/:id/compare')
  @HttpCode(200)
  compare(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.aiLimiter.hit(user.id);
    return this.plan.compare(user.id, id);
  }

  @Put('me/goal')
  goal(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(goalSchema)) dto: GoalInput) {
    return this.plan.setGoal(user.id, dto.dailyKcalGoal);
  }
}
