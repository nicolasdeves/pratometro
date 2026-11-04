import { useState } from 'react';
import { kcal } from '../lib/format';

export interface DayTotal {
  date: Date;
  kcal: number;
}

interface Props {
  days: DayTotal[];
  goal: number | null;
  selected: number;
  onSelect: (index: number) => void;
}

const W = 340;
const H = 180;
const PAD = { top: 22, bottom: 26, side: 6 };

/**
 * Calorias por dia da semana (uma série, então sem legenda) com a meta como
 * linha tracejada. Cada barra é clicável e mostra o valor ao passar o mouse.
 */
export function WeekChart({ days, goal, selected, onSelect }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(goal ?? 0, ...days.map((d) => d.kcal), 500) * 1.12;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = (W - PAD.side * 2) / days.length;
  const barW = Math.min(30, slot - 10);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const shown = hover ?? selected;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto max-h-64 w-full"
        role="img"
        aria-label="Calorias por dia na semana"
      >
        {/* linha de base */}
        <line
          x1={PAD.side}
          x2={W - PAD.side}
          y1={y(0)}
          y2={y(0)}
          stroke="#d6efdf"
          strokeWidth={1}
        />

        {days.map((d, i) => {
          const x = PAD.side + slot * i + (slot - barW) / 2;
          const h = Math.max(0, y(0) - y(d.kcal));
          const active = i === selected;
          const r = Math.min(4, h / 2);
          return (
            <g key={d.date.toISOString()}>
              {/* barra com cantos arredondados só no topo, presa à base */}
              {h > 0 && (
                <path
                  d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`}
                  fill={active ? '#19613e' : '#2c9a63'}
                  opacity={hover !== null && hover !== i ? 0.55 : 1}
                />
              )}
              {i === shown && d.kcal > 0 && (
                <text
                  x={x + barW / 2}
                  y={y(d.kcal) - 6}
                  textAnchor="middle"
                  className="fill-ink text-[10px] font-bold"
                >
                  {Math.round(d.kcal)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={H - 8}
                textAnchor="middle"
                className={`text-[10px] ${active ? 'fill-ink font-bold' : 'fill-muted'}`}
              >
                {d.date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </text>
              {/* área de clique maior que a barra */}
              <rect
                x={PAD.side + slot * i}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(i)}
              >
                <title>
                  {d.date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })}:{' '}
                  {kcal(d.kcal)}
                </title>
              </rect>
            </g>
          );
        })}

        {goal && (
          <g pointerEvents="none">
            <line
              x1={PAD.side}
              x2={W - PAD.side}
              y1={y(goal)}
              y2={y(goal)}
              stroke="#d9532a"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          </g>
        )}
      </svg>
      {goal && (
        <figcaption className="mt-1 flex items-center justify-center gap-2 text-xs text-muted">
          <span className="w-5 border-t-2 border-dashed border-tomato-600" />
          Meta diária: {kcal(goal)}
        </figcaption>
      )}
    </figure>
  );
}
