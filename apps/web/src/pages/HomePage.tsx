import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GoalProgress } from '../components/GoalProgress';
import { MacroBar } from '../components/MacroBar';
import { MealList } from '../components/MealList';
import { useAuth } from '../lib/auth';
import { useGoal } from '../lib/goal';
import { addDays, mealsApi, startOfDay, sumMeals, type Meal } from '../lib/meals';

export function HomePage() {
  const { user } = useAuth();
  const { goal, source } = useGoal();
  const firstName = user?.name?.split(' ')[0];
  const [meals, setMeals] = useState<Meal[] | null>(null);

  useEffect(() => {
    const today = startOfDay(new Date());
    mealsApi
      .list(today, addDays(today, 1))
      .then(setMeals)
      .catch(() => setMeals([]));
  }, []);

  const total = sumMeals(meals ?? []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted">Hoje</p>
        <h1 className="text-2xl font-extrabold">Olá{firstName ? `, ${firstName}` : ''}!</h1>
      </div>

      {/* No computador: resumo do dia à esquerda, refeições à direita. */}
      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-6 lg:sticky lg:top-24">
          {meals && (
            <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
              <GoalProgress consumed={total.kcal} goal={goal} source={source} />
              {meals.length > 0 && (
                <MacroBar protein={total.protein} carbs={total.carbs} fat={total.fat} />
              )}
            </section>
          )}

          <Link
            to="/refeicoes/nova"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-leaf-600 py-4 text-lg font-bold text-white shadow-sm hover:bg-leaf-700"
          >
            <Plus className="h-6 w-6" /> Nova refeição
          </Link>
        </div>

        <div className="space-y-3">
          {meals && (
            <MealList
              meals={meals}
              empty="Suas refeições do dia e o total de calorias aparecem aqui."
            />
          )}
        </div>
      </div>
    </div>
  );
}
