import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { planApi, type MealPlan } from './plan';

/**
 * Meta diária de calorias: a que a pessoa definiu; se não definiu, a do plano
 * alimentar enviado; se nenhuma, null (o diário só mostra o total).
 */
export function useGoal() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<MealPlan | null | undefined>(undefined);

  useEffect(() => {
    planApi
      .get()
      .then(setPlan)
      .catch(() => setPlan(null));
  }, []);

  const fromPlan = plan?.summary.dailyKcal ?? null;
  const goal = user?.dailyKcalGoal ?? fromPlan;
  const source: 'user' | 'plan' | null = user?.dailyKcalGoal ? 'user' : fromPlan ? 'plan' : null;
  return { goal, source, plan, loading: plan === undefined };
}
