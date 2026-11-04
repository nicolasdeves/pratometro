import { ChevronRight, UtensilsCrossed } from 'lucide-react';
import { Link } from 'react-router-dom';
import { kcal, time } from '../lib/format';
import type { Meal } from '../lib/meals';
import { MealPhoto } from './MealPhoto';

export function MealList({ meals, empty }: { meals: Meal[]; empty: string }) {
  if (meals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-leaf-100 bg-white p-8 text-center">
        <UtensilsCrossed className="mx-auto h-10 w-10 text-leaf-500" />
        <p className="mt-3 font-semibold">Nenhuma refeição registrada</p>
        <p className="mt-1 text-sm text-muted">{empty}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {meals.map((m) => (
        <li key={m.id}>
          <Link
            to={`/refeicoes/${m.id}`}
            className="flex items-center gap-4 rounded-2xl bg-white p-3 shadow-sm hover:ring-2 hover:ring-leaf-100"
          >
            <MealPhoto id={m.id} className="h-16 w-16 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{m.title}</p>
              <p className="text-sm text-muted">{time(m.eatenAt)}</p>
            </div>
            <p className="shrink-0 font-bold">{kcal(m.kcal)}</p>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
