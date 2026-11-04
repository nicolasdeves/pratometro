import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GoalProgress } from '../components/GoalProgress';
import { MacroBar } from '../components/MacroBar';
import { MealList } from '../components/MealList';
import { WeekChart } from '../components/WeekChart';
import { dayLabel, kcal } from '../lib/format';
import { useGoal } from '../lib/goal';
import { addDays, mealsApi, startOfDay, sumMeals, type Meal } from '../lib/meals';

/** Semana terminando em `end` (7 dias, o último é `end`). */
function weekEnding(end: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
}

export function DiaryPage() {
  const { goal, source } = useGoal();
  const today = startOfDay(new Date());
  const [end, setEnd] = useState(today);
  const [selected, setSelected] = useState(6);
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const days = useMemo(() => weekEnding(end), [end]);

  useEffect(() => {
    setMeals(null);
    mealsApi
      .list(days[0], addDays(days[6], 1))
      .then(setMeals)
      .catch(() => setMeals([]));
  }, [days]);

  const byDay = days.map((d) =>
    (meals ?? []).filter((m) => startOfDay(new Date(m.eatenAt)).getTime() === d.getTime()),
  );
  const totals = byDay.map((ms, i) => ({ date: days[i], kcal: sumMeals(ms).kcal }));
  const loggedDays = totals.filter((t) => t.kcal > 0);
  const average = loggedDays.length
    ? loggedDays.reduce((a, t) => a + t.kcal, 0) / loggedDays.length
    : 0;
  const onGoal = goal ? loggedDays.filter((t) => t.kcal <= goal).length : 0;
  const dayMeals = byDay[selected] ?? [];
  const dayTotal = sumMeals(dayMeals);
  const isCurrentWeek = end.getTime() === today.getTime();

  function moveWeek(delta: number) {
    setEnd((e) => addDays(e, delta * 7));
    setSelected(6);
  }

  const range = `${days[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Diário</h1>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => moveWeek(-1)}
            className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-leaf-50"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="font-semibold">{isCurrentWeek ? 'Últimos 7 dias' : range}</p>
          <button
            type="button"
            onClick={() => moveWeek(1)}
            disabled={isCurrentWeek}
            className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-leaf-50 disabled:opacity-30"
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <WeekChart days={totals} goal={goal} selected={selected} onSelect={setSelected} />

        <dl className="mt-2 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-cream p-3">
            <dt className="text-xs text-muted">Média por dia registrado</dt>
            <dd className="text-lg font-extrabold">{kcal(average)}</dd>
          </div>
          <div className="rounded-2xl bg-cream p-3">
            <dt className="text-xs text-muted">Dias dentro da meta</dt>
            <dd className="text-lg font-extrabold">
              {goal ? `${onGoal} de ${loggedDays.length}` : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-bold">{dayLabel(days[selected])}</h2>
        <GoalProgress consumed={dayTotal.kcal} goal={goal} source={source} />
        {dayMeals.length > 0 && (
          <MacroBar protein={dayTotal.protein} carbs={dayTotal.carbs} fat={dayTotal.fat} />
        )}
      </section>

      {meals && <MealList meals={dayMeals} empty="Nada registrado neste dia." />}
    </div>
  );
}
