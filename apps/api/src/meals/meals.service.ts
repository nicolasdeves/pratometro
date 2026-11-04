import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@pratometro/database';
import { GeminiService, type InlineFile } from '../gemini/gemini.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMealInput,
  ListMealsInput,
  MealQuestionsInput,
  UpdateItemInput,
} from './dto/meals.schema';
import { MEAL_ANALYSIS_SYSTEM, mealAnalysisSchema, mealParts } from './meal-analysis.prompt';
import { MEAL_QUESTIONS_SYSTEM, mealQuestionsSchema } from './meal-questions.prompt';

export interface FileUpload {
  buffer: Buffer;
  mimetype: string;
}

export interface MealUploads {
  photo: FileUpload;
  audio?: FileUpload;
  answersAudio?: FileUpload;
}

// Tudo menos os bytes da foto e do áudio: eles são servidos em rotas próprias.
// `audioMime` diz à tela se existe áudio para tocar.
export const mealSelect = {
  id: true,
  eatenAt: true,
  description: true,
  audioMime: true,
  transcript: true,
  clarifications: true,
  planFeedback: true,
  title: true,
  notes: true,
  model: true,
  kcal: true,
  protein: true,
  carbs: true,
  fat: true,
  createdAt: true,
  items: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      name: true,
      grams: true,
      unit: true,
      aiGrams: true,
      kcal: true,
      protein: true,
      carbs: true,
      fat: true,
      confidence: true,
    },
  },
} satisfies Prisma.MealSelect;

const NOT_FOOD = 'Não encontrei comida nesta foto. Tente outra.';

@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  /**
   * Etapa de perguntas: a IA vê foto + descrição e decide se precisa saber
   * mais alguma coisa antes de estimar. Nada é salvo aqui.
   */
  async questions(files: MealUploads, dto: MealQuestionsInput) {
    const { data } = await this.gemini.generateJson({
      system: MEAL_QUESTIONS_SYSTEM,
      parts: mealParts({
        photo: inline(files.photo),
        audio: files.audio && inline(files.audio),
        description: dto.description,
      }),
      schema: mealQuestionsSchema,
    });
    if (!data.isFood) throw new UnprocessableEntityException(NOT_FOOD);
    return {
      questions: data.questions.slice(0, 3).map((q) => ({
        question: q.question,
        options: q.options.slice(0, 4),
      })),
      transcript: data.transcript.trim() || null,
    };
  }

  /** Analisa foto + descrição (texto e/ou áudio) + respostas e salva a refeição. */
  async create(userId: string, files: MealUploads, dto: CreateMealInput) {
    const { data: analysis, model } = await this.gemini.generateJson({
      system: MEAL_ANALYSIS_SYSTEM,
      parts: mealParts({
        photo: inline(files.photo),
        audio: files.audio && inline(files.audio),
        description: dto.description,
        clarifications: dto.clarifications,
        answersAudio: files.answersAudio && inline(files.answersAudio),
      }),
      schema: mealAnalysisSchema,
    });

    if (!analysis.isFood || analysis.items.length === 0) {
      throw new UnprocessableEntityException(analysis.notes || NOT_FOOD);
    }

    const items = analysis.items.map((it, position) => ({
      position,
      name: it.name,
      grams: it.grams,
      unit: it.unit,
      aiGrams: it.grams,
      kcal: it.kcal,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
      confidence: it.confidence,
    }));

    // A resposta por áudio vira texto junto da pergunta, para a tela e o PDF.
    const answersTranscript = analysis.answersTranscript.trim();
    const clarifications = dto.clarifications?.length
      ? dto.clarifications.map((c) => ({
          question: c.question,
          answer: c.answer || (answersTranscript ? '(respondido por áudio)' : ''),
        }))
      : undefined;
    const clarificationsJson = clarifications && {
      items: clarifications,
      ...(answersTranscript ? { audioTranscript: answersTranscript } : {}),
    };

    return this.prisma.client.meal.create({
      data: {
        userId,
        eatenAt: dto.eatenAt ? new Date(dto.eatenAt) : undefined,
        photo: new Uint8Array(files.photo.buffer),
        photoMime: files.photo.mimetype,
        description: dto.description,
        audio: files.audio ? new Uint8Array(files.audio.buffer) : undefined,
        audioMime: files.audio?.mimetype,
        transcript: files.audio ? analysis.transcript.trim() || null : null,
        clarifications: clarificationsJson,
        title: analysis.title,
        notes: analysis.notes,
        model,
        ...sumTotals(items),
        items: { create: items },
      },
      select: mealSelect,
    });
  }

  list(userId: string, { from, to }: ListMealsInput) {
    return this.prisma.client.meal.findMany({
      where: { userId, eatenAt: { gte: new Date(from), lt: new Date(to) } },
      orderBy: { eatenAt: 'asc' },
      select: mealSelect,
    });
  }

  async get(userId: string, id: string) {
    const meal = await this.prisma.client.meal.findFirst({
      where: { id, userId },
      select: mealSelect,
    });
    if (!meal) throw new NotFoundException('Refeição não encontrada');
    return meal;
  }

  /**
   * Ajusta a porção de um alimento: os nutrientes escalam na mesma proporção
   * (a composição do alimento não muda). Porção 0 remove o item.
   */
  async updateItem(userId: string, mealId: string, itemId: string, { grams }: UpdateItemInput) {
    const item = await this.prisma.client.mealItem.findFirst({
      where: { id: itemId, mealId, meal: { userId } },
    });
    if (!item) throw new NotFoundException('Alimento não encontrado');

    await this.prisma.client.$transaction(async (tx) => {
      if (grams === 0) {
        await tx.mealItem.delete({ where: { id: itemId } });
      } else {
        const ratio = grams / item.grams;
        await tx.mealItem.update({
          where: { id: itemId },
          data: {
            grams,
            kcal: item.kcal * ratio,
            protein: item.protein * ratio,
            carbs: item.carbs * ratio,
            fat: item.fat * ratio,
          },
        });
      }
      const items = await tx.mealItem.findMany({ where: { mealId } });
      // A comparação com o plano ficou velha: os números mudaram.
      await tx.meal.update({
        where: { id: mealId },
        data: { ...sumTotals(items), planFeedback: Prisma.DbNull },
      });
    });
    return this.get(userId, mealId);
  }

  async photo(userId: string, id: string) {
    const meal = await this.prisma.client.meal.findFirst({
      where: { id, userId },
      select: { photo: true, photoMime: true },
    });
    if (!meal) throw new NotFoundException('Refeição não encontrada');
    return meal;
  }

  async audio(userId: string, id: string) {
    const meal = await this.prisma.client.meal.findFirst({
      where: { id, userId },
      select: { audio: true, audioMime: true },
    });
    if (!meal?.audio || !meal.audioMime) throw new NotFoundException('Esta refeição não tem áudio');
    return { audio: meal.audio, audioMime: meal.audioMime };
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.client.meal.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Refeição não encontrada');
  }
}

type Nutrients = { kcal: number; protein: number; carbs: number; fat: number };

export function sumTotals(items: Nutrients[]): Nutrients {
  return items.reduce(
    (t, it) => ({
      kcal: t.kcal + it.kcal,
      protein: t.protein + it.protein,
      carbs: t.carbs + it.carbs,
      fat: t.fat + it.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function inline(f: FileUpload): InlineFile {
  return { data: f.buffer, mimeType: f.mimetype };
}
