import { request, requestBlob } from './api';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MealItem {
  id: string;
  name: string;
  grams: number;
  unit: 'g' | 'ml';
  aiGrams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: Confidence;
}

export interface Clarification {
  question: string;
  answer: string;
}

export interface PlanFeedback {
  planMealName: string;
  verdict: 'ok' | 'above' | 'below' | 'off';
  summary: string;
  suggestions: string[];
}

export interface Meal {
  id: string;
  eatenAt: string;
  description: string | null;
  audioMime: string | null;
  transcript: string | null;
  clarifications: { items: Clarification[]; audioTranscript?: string } | null;
  planFeedback: PlanFeedback | null;
  title: string;
  notes: string | null;
  model: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: string;
  items: MealItem[];
}

export interface Question {
  question: string;
  options: string[];
}

export interface MealDraft {
  photo: Blob;
  description?: string;
  audio?: Blob | null;
}

export interface MealSubmit extends MealDraft {
  clarifications?: Clarification[];
  answersAudio?: Blob | null;
}

function draftForm({ photo, description, audio }: MealDraft) {
  const form = new FormData();
  form.append('photo', photo, 'prato.jpg');
  if (description) form.append('description', description);
  if (audio) form.append('audio', audio, 'descricao.wav');
  return form;
}

export const mealsApi = {
  /** Etapa de perguntas: a IA diz se precisa saber mais alguma coisa. */
  questions: (draft: MealDraft) =>
    request<{ questions: Question[]; transcript: string | null }>('/meals/questions', {
      method: 'POST',
      body: draftForm(draft),
    }),

  create: ({ clarifications, answersAudio, ...draft }: MealSubmit) => {
    const form = draftForm(draft);
    form.append('eatenAt', new Date().toISOString());
    if (clarifications?.length) form.append('clarifications', JSON.stringify(clarifications));
    if (answersAudio) form.append('answersAudio', answersAudio, 'respostas.wav');
    return request<Meal>('/meals', { method: 'POST', body: form });
  },

  /** Refeições entre `from` (incluso) e `to` (exclusivo). */
  list: (from: Date, to: Date) => {
    const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    return request<Meal[]>(`/meals?${qs}`);
  },

  get: (id: string) => request<Meal>(`/meals/${id}`),

  updateItem: (mealId: string, itemId: string, grams: number) =>
    request<Meal>(`/meals/${mealId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ grams }),
    }),

  compare: (id: string) => request<PlanFeedback>(`/meals/${id}/compare`, { method: 'POST' }),

  photo: (id: string) => requestBlob(`/meals/${id}/photo`),

  audio: (id: string) => requestBlob(`/meals/${id}/audio`),

  report: (id: string) => requestBlob(`/meals/${id}/report.pdf`),

  remove: (id: string) => request<void>(`/meals/${id}`, { method: 'DELETE' }),
};

/** Início do dia local de `d`. */
export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function sumMeals(meals: Pick<Meal, 'kcal' | 'protein' | 'carbs' | 'fat'>[]) {
  return meals.reduce(
    (t, m) => ({
      kcal: t.kcal + m.kcal,
      protein: t.protein + m.protein,
      carbs: t.carbs + m.carbs,
      fat: t.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
