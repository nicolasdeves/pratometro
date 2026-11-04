import { request, requestBlob } from './api';

export interface PlanSummary {
  dailyKcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  meals: { name: string; time: string; foods: string[] }[];
  guidelines: string[];
}

export interface MealPlan {
  fileName: string;
  summary: PlanSummary;
  model: string;
  updatedAt: string;
}

export const planApi = {
  get: () => request<{ plan: MealPlan | null }>('/plan').then((r) => r.plan),

  upload: (pdf: File) => {
    const form = new FormData();
    form.append('pdf', pdf, pdf.name);
    return request<MealPlan>('/plan', { method: 'PUT', body: form });
  },

  pdf: () => requestBlob('/plan/pdf'),

  remove: () => request<void>('/plan', { method: 'DELETE' }),

  setGoal: (dailyKcalGoal: number | null) =>
    request<{ dailyKcalGoal: number | null }>('/me/goal', {
      method: 'PUT',
      body: JSON.stringify({ dailyKcalGoal }),
    }),
};

/**
 * Baixa um arquivo (blob autenticado). Link com `download` em vez de
 * window.open: depois de um await o clique já "passou" e o bloqueador de
 * pop-up (Safari no iPhone, principalmente) barra a aba nova.
 */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
