import type { Confidence } from './meals';

export const kcal = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} kcal`;

export const grams = (v: number, unit = 'g') => `${Math.round(v).toLocaleString('pt-BR')} ${unit}`;

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const confidenceLabel: Record<Confidence, string> = {
  HIGH: 'Alta confiança',
  MEDIUM: 'Média confiança',
  LOW: 'Palpite',
};

export const dayLabel = (d: Date) => {
  const s = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
