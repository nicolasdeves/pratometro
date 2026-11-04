import { FileText, Sparkles, Target, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { kcal } from '../lib/format';
import { planApi, saveBlob, type MealPlan } from '../lib/plan';

export function ProfilePage() {
  const { user, patchUser } = useAuth();
  const [goal, setGoal] = useState(user?.dailyKcalGoal ? String(user.dailyKcalGoal) : '');
  const [goalMsg, setGoalMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [plan, setPlan] = useState<MealPlan | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    planApi
      .get()
      .then(setPlan)
      .catch(() => setPlan(null));
  }, []);

  async function saveGoal(e: FormEvent) {
    e.preventDefault();
    setGoalMsg(null);
    const value = goal.trim() ? Number(goal) : null;
    try {
      const res = await planApi.setGoal(value);
      patchUser({ dailyKcalGoal: res.dailyKcalGoal });
      setGoalMsg({ ok: true, text: value ? 'Meta salva.' : 'Meta removida.' });
    } catch (err) {
      const text =
        err instanceof ApiError ? (err.issues?.[0]?.message ?? err.message) : 'Erro ao salvar';
      setGoalMsg({ ok: false, text });
    }
  }

  async function onPdf(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPlanError(null);
    setUploading(true);
    try {
      setPlan(await planApi.upload(file));
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : 'Não consegui ler o PDF.');
    } finally {
      setUploading(false);
    }
  }

  async function removePlan() {
    if (!confirm('Remover o plano alimentar?')) return;
    await planApi.remove();
    setPlan(null);
  }

  const s = plan?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Perfil</h1>
        <p className="text-sm text-muted">{user?.email}</p>
      </div>

      {/* No computador: meta à esquerda, plano (mais longo) à direita. */}
      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-8 lg:space-y-0">
        <form
          onSubmit={(e) => void saveGoal(e)}
          className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"
        >
          <h2 className="flex items-center gap-2 font-bold">
            <Target className="h-5 w-5 text-leaf-600" /> Meta diária de calorias
          </h2>
          <p className="text-sm text-muted">
            Usada no diário. Sem meta, vale a do seu plano alimentar (se houver).
          </p>
          <div className="flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-xl border border-leaf-100 bg-white px-3 py-2 focus-within:border-leaf-500">
              <input
                type="number"
                inputMode="numeric"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={s?.dailyKcal ? String(s.dailyKcal) : 'Ex.: 2000'}
                className="w-full outline-none"
                aria-label="Meta diária em kcal"
              />
              <span className="text-muted">kcal</span>
            </label>
            <button type="submit" className="rounded-xl bg-leaf-600 px-5 font-bold text-white">
              Salvar
            </button>
          </div>
          {goalMsg && (
            <p className={`text-sm ${goalMsg.ok ? 'text-leaf-700' : 'text-tomato-600'}`}>
              {goalMsg.text}
            </p>
          )}
        </form>

        <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
          <div>
            <h2 className="flex items-center gap-2 font-bold">
              <FileText className="h-5 w-5 text-leaf-600" /> Plano alimentar
            </h2>
            <p className="text-sm text-muted">
              Envie o PDF do seu nutricionista. A IA lê o plano e passa a comparar suas refeições
              com ele.
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => void onPdf(e)}
            data-testid="plan-input"
          />

          {planError && (
            <p className="rounded-xl bg-tomato-100 px-4 py-3 text-sm text-tomato-600">
              {planError}
            </p>
          )}

          {uploading ? (
            <p className="flex items-center gap-2 rounded-2xl bg-leaf-50 p-4 text-sm font-semibold text-leaf-900">
              <Sparkles className="h-5 w-5 animate-pulse text-leaf-600" /> A IA está lendo o seu
              plano…
            </p>
          ) : plan && s ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-cream p-3">
                <button
                  type="button"
                  onClick={() => void planApi.pdf().then((b) => saveBlob(b, plan.fileName))}
                  className="truncate text-left text-sm font-semibold text-leaf-700 underline"
                >
                  {plan.fileName}
                </button>
                <button
                  type="button"
                  onClick={() => void removePlan()}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-tomato-100 hover:text-tomato-600"
                  aria-label="Remover plano"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                {(
                  [
                    ['Energia', s.dailyKcal != null ? kcal(s.dailyKcal) : '—'],
                    ['Proteína', s.protein != null ? `${s.protein} g` : '—'],
                    ['Carboidratos', s.carbs != null ? `${s.carbs} g` : '—'],
                    ['Gordura', s.fat != null ? `${s.fat} g` : '—'],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className="rounded-2xl bg-cream p-3">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="font-extrabold">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="space-y-3">
                {s.meals.map((m) => (
                  <div key={m.name}>
                    <p className="text-sm font-bold">
                      {m.name}
                      {m.time && <span className="font-normal text-muted"> · {m.time}</span>}
                    </p>
                    <ul className="list-disc pl-5 text-sm text-muted">
                      {m.foods.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {s.guidelines.length > 0 && (
                <div className="rounded-2xl bg-leaf-50 p-4">
                  <p className="text-sm font-bold text-leaf-900">Orientações</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-leaf-900">
                    {s.guidelines.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="text-sm font-semibold text-leaf-700"
              >
                Trocar por outro PDF
              </button>
            </div>
          ) : plan === null ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-leaf-100 py-6 font-semibold hover:border-leaf-500"
            >
              <Upload className="h-5 w-5 text-leaf-600" /> Enviar PDF do plano
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
