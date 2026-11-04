import { grams } from '../lib/format';

interface Props {
  protein: number;
  carbs: number;
  fat: number;
}

// kcal por grama de cada macro: a barra mostra a fatia de energia, não de peso.
const MACROS = [
  { key: 'protein', label: 'Proteína', kcalPerG: 4, color: 'bg-leaf-500' },
  { key: 'carbs', label: 'Carboidratos', kcalPerG: 4, color: 'bg-amber-400' },
  { key: 'fat', label: 'Gordura', kcalPerG: 9, color: 'bg-tomato-500' },
] as const;

export function MacroBar(props: Props) {
  const energy = MACROS.map((m) => props[m.key] * m.kcalPerG);
  const total = energy.reduce((a, b) => a + b, 0) || 1;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-leaf-50">
        {MACROS.map((m, i) => (
          <div key={m.key} className={m.color} style={{ width: `${(energy[i] / total) * 100}%` }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {MACROS.map((m) => (
          <div key={m.key}>
            <dt className="flex items-center justify-center gap-1.5 text-xs text-muted">
              <span className={`h-2 w-2 rounded-full ${m.color}`} />
              {m.label}
            </dt>
            <dd className="font-bold">{grams(props[m.key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
