import {
  ArrowLeft,
  ClipboardCheck,
  FileDown,
  MessageCircleQuestion,
  MessageSquareText,
  Mic,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MacroBar } from '../components/MacroBar';
import { MealPhoto } from '../components/MealPhoto';
import { ApiError } from '../lib/api';
import { confidenceLabel, grams, kcal, time } from '../lib/format';
import {
  mealsApi,
  type Confidence,
  type Meal,
  type MealItem,
  type PlanFeedback,
} from '../lib/meals';
import { saveBlob } from '../lib/plan';

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  HIGH: 'bg-leaf-50 text-leaf-700',
  MEDIUM: 'bg-amber-50 text-amber-700',
  LOW: 'bg-tomato-100 text-tomato-600',
};

const VERDICT: Record<PlanFeedback['verdict'], { label: string; style: string }> = {
  ok: { label: 'Dentro do plano', style: 'bg-leaf-600 text-white' },
  above: { label: 'Acima do plano', style: 'bg-tomato-500 text-white' },
  below: { label: 'Abaixo do plano', style: 'bg-amber-400 text-ink' },
  off: { label: 'Fora do plano', style: 'bg-tomato-600 text-white' },
};

export function MealPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [meal, setMeal] = useState<Meal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'compare' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    mealsApi
      .get(id)
      .then(setMeal)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar'));
  }, [id]);

  async function remove() {
    if (!confirm('Excluir esta refeição?')) return;
    await mealsApi.remove(id);
    navigate('/', { replace: true });
  }

  async function saveItem(item: MealItem, value: number) {
    setEditing(null);
    if (Math.round(value) === Math.round(item.grams)) return;
    if (value === 0 && !confirm(`Tirar "${item.name}" da refeição?`)) return;
    setMeal(await mealsApi.updateItem(id, item.id, value));
  }

  async function pdf() {
    setBusy('pdf');
    setActionError(null);
    try {
      saveBlob(
        await mealsApi.report(id),
        `pratometro-${meal?.eatenAt.slice(0, 10) ?? 'refeicao'}.pdf`,
      );
    } catch {
      setActionError('Não consegui gerar o PDF. Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  async function compare() {
    setBusy('compare');
    setActionError(null);
    try {
      const planFeedback = await mealsApi.compare(id);
      setMeal((m) => (m ? { ...m, planFeedback } : m));
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Não consegui comparar. Tente de novo.',
      );
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="text-center text-muted">{error}</p>;
  if (!meal) {
    return (
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-leaf-100 border-t-leaf-600" />
    );
  }

  const clar = meal.clarifications;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-leaf-50"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <button
          type="button"
          onClick={() => void remove()}
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-tomato-100 hover:text-tomato-600"
          aria-label="Excluir refeição"
          title="Excluir"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* No computador: foto e resumo fixos à esquerda, detalhes à direita. */}
      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-5 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <MealPhoto id={meal.id} className="aspect-[4/3] max-h-[50vh] w-full" />
            <div className="space-y-4 p-5">
              <div>
                <p className="text-sm text-muted">{time(meal.eatenAt)}</p>
                <h1 className="text-xl font-extrabold">{meal.title}</h1>
              </div>
              <p className="text-4xl font-extrabold text-tomato-600">{kcal(meal.kcal)}</p>
              <MacroBar protein={meal.protein} carbs={meal.carbs} fat={meal.fat} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void pdf()}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 rounded-2xl border border-leaf-100 bg-white py-3 font-semibold hover:border-leaf-500 disabled:opacity-50"
            >
              <FileDown className="h-5 w-5 text-leaf-600" />
              {busy === 'pdf' ? 'Gerando…' : 'Relatório PDF'}
            </button>
            <button
              type="button"
              onClick={() => void compare()}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 rounded-2xl border border-leaf-100 bg-white py-3 font-semibold hover:border-leaf-500 disabled:opacity-50"
            >
              <ClipboardCheck className="h-5 w-5 text-leaf-600" />
              {busy === 'compare' ? 'Comparando…' : 'Comparar com plano'}
            </button>
          </div>
          {actionError && <p className="text-center text-sm text-tomato-600">{actionError}</p>}
        </div>

        <div className="space-y-5">
          {meal.planFeedback?.verdict && <PlanFeedbackCard feedback={meal.planFeedback} />}
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <h2 className="font-bold">O que tinha no prato</h2>
              <p className="text-xs text-muted">Toque no lápis para ajustar a porção</p>
            </div>
            <ul className="mt-3 divide-y divide-leaf-50">
              {meal.items.map((it) => (
                <li key={it.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{it.name}</p>
                      <p className="text-sm text-muted">
                        {grams(it.grams, it.unit)}
                        {Math.round(it.grams) !== Math.round(it.aiGrams) && (
                          <span className="text-xs"> (IA: {grams(it.aiGrams, it.unit)})</span>
                        )}{' '}
                        · P {grams(it.protein)} · C {grams(it.carbs)} · G {grams(it.fat)}
                      </p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${CONFIDENCE_STYLE[it.confidence]}`}
                      >
                        {confidenceLabel[it.confidence]}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <p className="font-bold">{kcal(it.kcal)}</p>
                      <button
                        type="button"
                        onClick={() => setEditing(editing === it.id ? null : it.id)}
                        className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-leaf-50 hover:text-ink"
                        aria-label={`Ajustar porção de ${it.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {editing === it.id && (
                    <PortionEditor
                      item={it}
                      onSave={(v) => void saveItem(it, v)}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>

          {(meal.description || meal.audioMime) && (
            <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 font-bold">
                <MessageSquareText className="h-5 w-5 text-leaf-600" /> O que você contou
              </h2>
              {meal.description && <p className="text-muted">“{meal.description}”</p>}
              {meal.audioMime && (
                <div className="space-y-2">
                  <MealAudio id={meal.id} />
                  {meal.transcript && (
                    <p className="text-sm text-muted">
                      <Mic className="mr-1 inline h-4 w-4" />
                      Transcrição: “{meal.transcript}”
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {clar && clar.items.length > 0 && (
            <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 font-bold">
                <MessageCircleQuestion className="h-5 w-5 text-leaf-600" /> Perguntas da IA
              </h2>
              <dl className="space-y-2">
                {clar.items.map((c) => (
                  <div key={c.question}>
                    <dt className="text-sm font-semibold">{c.question}</dt>
                    <dd className="text-sm text-muted">{c.answer || '—'}</dd>
                  </div>
                ))}
              </dl>
              {clar.audioTranscript && (
                <p className="text-sm text-muted">
                  <Mic className="mr-1 inline h-4 w-4" />
                  Respostas por áudio: “{clar.audioTranscript}”
                </p>
              )}
            </section>
          )}

          {meal.notes && (
            <section className="rounded-3xl bg-leaf-50 p-5">
              <h2 className="flex items-center gap-2 font-bold text-leaf-900">
                <Sparkles className="h-5 w-5 text-leaf-600" /> O que a IA considerou
              </h2>
              <p className="mt-2 text-leaf-900">{meal.notes}</p>
              <p className="mt-3 text-xs text-leaf-700">
                Estimativa feita por IA. Não substitui um nutricionista.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function PortionEditor({
  item,
  onSave,
  onCancel,
}: {
  item: MealItem;
  onSave: (value: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(Math.round(item.grams));
  const step = item.grams >= 200 ? 25 : 10;
  const preview = item.grams ? (item.kcal * value) / item.grams : 0;
  const quick = [0.5, 1, 1.5].map((f) => ({ f, v: Math.round((item.aiGrams * f) / 5) * 5 }));

  return (
    <div className="mt-3 space-y-3 rounded-2xl bg-cream p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setValue((v) => Math.max(0, v - step))}
          className="grid h-10 w-10 place-items-center rounded-full border border-leaf-100 bg-white"
          aria-label="Diminuir"
        >
          <Minus className="h-4 w-4" />
        </button>
        <label className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-leaf-100 bg-white px-3 py-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={value}
            onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 text-center text-lg font-bold outline-none"
            aria-label="Porção"
          />
          <span className="text-muted">{item.unit}</span>
        </label>
        <button
          type="button"
          onClick={() => setValue((v) => v + step)}
          className="grid h-10 w-10 place-items-center rounded-full border border-leaf-100 bg-white"
          aria-label="Aumentar"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {quick.map(({ f, v }) => (
          <button
            key={f}
            type="button"
            onClick={() => setValue(v)}
            className="rounded-full border border-leaf-100 bg-white px-3 py-1 text-xs font-semibold text-muted hover:border-leaf-500"
          >
            {f === 1 ? 'Como a IA estimou' : f < 1 ? 'Metade' : '1,5×'} ({v} {item.unit})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setValue(0)}
          className="rounded-full border border-tomato-100 bg-white px-3 py-1 text-xs font-semibold text-tomato-600"
        >
          Não comi
        </button>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Fica: <strong className="text-ink">{kcal(preview)}</strong>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-sm font-semibold text-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(value)}
            className="rounded-xl bg-leaf-600 px-4 py-2 text-sm font-bold text-white"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanFeedbackCard({ feedback }: { feedback: PlanFeedback }) {
  const v = VERDICT[feedback.verdict];
  return (
    <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <ClipboardCheck className="h-5 w-5 text-leaf-600" /> {feedback.planMealName} do seu plano
        </h2>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${v.style}`}>{v.label}</span>
      </div>
      <p className="text-ink">{feedback.summary}</p>
      {feedback.suggestions.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {feedback.suggestions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MealAudio({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    mealsApi
      .audio(id)
      .then((b) => setUrl((u = URL.createObjectURL(b))))
      .catch(() => undefined);
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return url ? <audio src={url} controls className="h-10 w-full" /> : null;
}
