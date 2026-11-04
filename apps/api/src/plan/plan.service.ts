import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { GeminiService } from '../gemini/gemini.service';
import { mealSelect, sumTotals, type FileUpload } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PLAN_COMPARE_SYSTEM,
  PLAN_EXTRACT_SYSTEM,
  planFeedbackSchema,
  planSummarySchema,
  type PlanSummary,
} from './plan.prompts';

const TZ = 'America/Sao_Paulo';

@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  /** O plano atual, sem os bytes do PDF. null se a pessoa não enviou nenhum. */
  async get(userId: string) {
    return this.prisma.client.mealPlan.findUnique({
      where: { userId },
      select: { fileName: true, summary: true, model: true, updatedAt: true },
    });
  }

  /** Lê o PDF com o Gemini e guarda (substitui o anterior). */
  async upload(userId: string, pdf: FileUpload & { originalname?: string }) {
    const { data, model } = await this.gemini.generateJson({
      system: PLAN_EXTRACT_SYSTEM,
      parts: [
        { data: pdf.buffer, mimeType: 'application/pdf' },
        'Extraia o plano alimentar deste PDF.',
      ],
      schema: planSummarySchema,
    });
    if (!data.isMealPlan) {
      throw new UnprocessableEntityException(
        'Este PDF não parece ser um plano alimentar. Envie o plano passado pelo seu nutricionista.',
      );
    }
    const { isMealPlan: _ignored, ...summary } = data;
    const fileName = (pdf.originalname || 'plano-alimentar.pdf').slice(0, 120);
    const saved = { pdf: new Uint8Array(pdf.buffer), fileName, summary, model };
    await this.prisma.client.mealPlan.upsert({
      where: { userId },
      create: { userId, ...saved },
      update: saved,
    });
    return this.get(userId);
  }

  async pdf(userId: string) {
    const plan = await this.prisma.client.mealPlan.findUnique({
      where: { userId },
      select: { pdf: true, fileName: true },
    });
    if (!plan) throw new NotFoundException('Nenhum plano enviado');
    return plan;
  }

  async remove(userId: string) {
    await this.prisma.client.mealPlan.deleteMany({ where: { userId } });
  }

  /** Compara uma refeição com o plano e guarda o resultado na refeição. */
  async compare(userId: string, mealId: string) {
    const plan = await this.prisma.client.mealPlan.findUnique({ where: { userId } });
    if (!plan) throw new NotFoundException('Envie seu plano alimentar no perfil primeiro');
    const meal = await this.prisma.client.meal.findFirst({
      where: { id: mealId, userId },
      select: mealSelect,
    });
    if (!meal) throw new NotFoundException('Refeição não encontrada');

    // O que mais a pessoa comeu no mesmo dia (no fuso do Brasil), para a meta diária.
    const day = meal.eatenAt.toLocaleDateString('en-CA', { timeZone: TZ });
    const dayStart = new Date(`${day}T00:00:00-03:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    const others = await this.prisma.client.meal.findMany({
      where: { userId, id: { not: mealId }, eatenAt: { gte: dayStart, lt: dayEnd } },
      select: { kcal: true, protein: true, carbs: true, fat: true },
    });
    const restOfDay = sumTotals(others);

    const summary = plan.summary as PlanSummary;
    const time = meal.eatenAt.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: TZ,
    });
    const r = Math.round;
    const prompt = [
      `Plano alimentar da pessoa (JSON):\n${JSON.stringify(summary)}`,
      `Refeição registrada às ${time}: ${meal.title}\n` +
        meal.items
          .map(
            (i) =>
              `- ${i.name}: ${r(i.grams)} ${i.unit}, ${r(i.kcal)} kcal, P ${r(i.protein)} g, C ${r(i.carbs)} g, G ${r(i.fat)} g`,
          )
          .join('\n') +
        `\nTotal: ${r(meal.kcal)} kcal, P ${r(meal.protein)} g, C ${r(meal.carbs)} g, G ${r(meal.fat)} g`,
      `Outras refeições já registradas no mesmo dia somam ${r(restOfDay.kcal)} kcal ` +
        `(P ${r(restOfDay.protein)} g, C ${r(restOfDay.carbs)} g, G ${r(restOfDay.fat)} g).`,
    ];

    const { data } = await this.gemini.generateJson({
      system: PLAN_COMPARE_SYSTEM,
      parts: prompt,
      schema: planFeedbackSchema,
    });
    const feedback = { ...data, suggestions: data.suggestions.slice(0, 3) };
    await this.prisma.client.meal.update({
      where: { id: mealId },
      data: { planFeedback: feedback },
    });
    return feedback;
  }

  async setGoal(userId: string, dailyKcalGoal: number | null) {
    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data: { dailyKcalGoal },
      select: { dailyKcalGoal: true },
    });
    return user;
  }
}
