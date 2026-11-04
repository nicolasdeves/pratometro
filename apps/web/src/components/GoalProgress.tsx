import { Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { kcal } from '../lib/format';

interface Props {
  consumed: number;
  goal: number | null;
  source: 'user' | 'plan' | null;
}

/** Progresso do dia contra a meta: um número em destaque, não um gráfico. */
export function GoalProgress({ consumed, goal, source }: Props) {
  if (!goal) {
    return (
      <div>
        <p className="text-sm text-muted">Total do dia</p>
        <p className="text-3xl font-extrabold text-tomato-600">{kcal(consumed)}</p>
        <Link
          to="/perfil"
          className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-leaf-700"
        >
          <Target className="h-4 w-4" /> Definir uma meta diária
        </Link>
      </div>
    );
  }

  const pct = consumed / goal;
  const left = goal - consumed;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Total do dia</p>
          <p className="text-3xl font-extrabold text-tomato-600">{kcal(consumed)}</p>
        </div>
        <p className="pb-1 text-right text-sm text-muted">
          meta {kcal(goal)}
          {source === 'plan' && <span className="block text-xs">do seu plano alimentar</span>}
        </p>
      </div>
      <div
        className="mt-3 h-3 overflow-hidden rounded-full bg-leaf-50"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.round(consumed)}
        aria-label="Calorias do dia em relação à meta"
      >
        <div
          className={`h-full rounded-full ${pct > 1 ? 'bg-tomato-500' : 'bg-leaf-500'}`}
          style={{ width: `${Math.min(100, pct * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-sm font-semibold">
        {left >= 0 ? `Faltam ${kcal(left)} para a meta` : `${kcal(-left)} acima da meta`}
      </p>
    </div>
  );
}
