import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/jwt-payload';
import { isSilentWav } from '../common/audio-silence';
import { RateLimiter } from '../common/rate-limit';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createMealSchema,
  listMealsSchema,
  mealQuestionsInputSchema,
  updateItemSchema,
  type CreateMealInput,
  type ListMealsInput,
  type MealQuestionsInput,
  type UpdateItemInput,
} from './dto/meals.schema';
import { MealReportService } from './meal-report.service';
import { MealsService, type FileUpload, type MealUploads } from './meals.service';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// O navegador converte a gravação para WAV; os outros ficam para quem usar a API direto.
const AUDIO_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
];

type UploadedMealFiles = {
  photo?: FileUpload[];
  audio?: FileUpload[];
  answersAudio?: FileUpload[];
};

const mealFiles = () =>
  FileFieldsInterceptor(
    [
      { name: 'photo', maxCount: 1 },
      { name: 'audio', maxCount: 1 },
      { name: 'answersAudio', maxCount: 1 },
    ],
    // 1 min de WAV mono 16 kHz ≈ 1,9 MB; a foto já chega reduzida.
    { limits: { fileSize: 5 * 1024 * 1024 } },
  );

@Controller('meals')
export class MealsController {
  // Cada chamada gasta cota do Gemini: 60 por hora por pessoa
  // (uma refeição usa duas: perguntas e análise).
  private readonly aiLimiter = new RateLimiter(60, 60 * 60_000);

  constructor(
    private readonly meals: MealsService,
    private readonly report: MealReportService,
  ) {}

  @Post('questions')
  @HttpCode(200)
  @UseInterceptors(mealFiles())
  questions(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: UploadedMealFiles | undefined,
    @Body(new ZodValidationPipe(mealQuestionsInputSchema)) dto: MealQuestionsInput,
  ) {
    const uploads = validateFiles(files);
    this.aiLimiter.hit(user.id);
    return this.meals.questions(uploads, dto);
  }

  @Post()
  @UseInterceptors(mealFiles())
  create(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: UploadedMealFiles | undefined,
    @Body(new ZodValidationPipe(createMealSchema)) dto: CreateMealInput,
  ) {
    const uploads = validateFiles(files);
    this.aiLimiter.hit(user.id);
    return this.meals.create(user.id, uploads, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listMealsSchema)) query: ListMealsInput,
  ) {
    return this.meals.list(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meals.get(user.id, id);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(updateItemSchema)) dto: UpdateItemInput,
  ) {
    return this.meals.updateItem(user.id, id, itemId, dto);
  }

  @Get(':id/photo')
  async photo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const { photo, photoMime } = await this.meals.photo(user.id, id);
    res.setHeader('Content-Type', photoMime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(Buffer.from(photo));
  }

  @Get(':id/audio')
  async audio(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const { audio, audioMime } = await this.meals.audio(user.id, id);
    res.setHeader('Content-Type', audioMime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(Buffer.from(audio));
  }

  @Get(':id/report.pdf')
  async pdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const { buffer, fileName } = await this.report.render(user.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.end(buffer);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meals.remove(user.id, id);
  }
}

function validateFiles(files: UploadedMealFiles | undefined): MealUploads {
  const photo = files?.photo?.[0];
  const audio = files?.audio?.[0];
  const answersAudio = files?.answersAudio?.[0];
  if (!photo) throw new BadRequestException('Envie a foto do prato');
  if (!PHOTO_TYPES.includes(photo.mimetype)) {
    throw new BadRequestException('A foto precisa ser JPEG, PNG ou WebP');
  }
  for (const a of [audio, answersAudio]) {
    if (a && !AUDIO_TYPES.includes(a.mimetype)) {
      throw new BadRequestException('Formato de áudio não suportado');
    }
    if (a && isSilentWav(a.buffer)) {
      throw new BadRequestException(
        'Não deu para ouvir nada no áudio. Grave de novo, mais perto do microfone, ou apague o áudio.',
      );
    }
  }
  return { photo, audio, answersAudio };
}
