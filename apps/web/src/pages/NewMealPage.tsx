import {
  ArrowLeft,
  Camera,
  ImagePlus,
  MessageCircleQuestion,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AudioRecorder } from '../components/AudioRecorder';
import { ApiError } from '../lib/api';
import { compressPhoto } from '../lib/image';
import { mealsApi, type Question } from '../lib/meals';

type Step = 'photo' | 'describe' | 'checking' | 'questions' | 'analyzing';

const STEPS: { key: Step; label: string }[] = [
  { key: 'photo', label: 'Foto' },
  { key: 'describe', label: 'Descrição' },
  { key: 'questions', label: 'Perguntas' },
  { key: 'analyzing', label: 'Análise' },
];

const HINTS = ['Fritei no azeite', 'Comi só metade', 'Tinha 2 colheres de arroz', 'Bebi um suco'];

// Frases que se alternam enquanto o Gemini trabalha (a chamada leva alguns segundos).
const ANALYZING_MESSAGES = [
  'Identificando os alimentos…',
  'Estimando as porções…',
  'Considerando o que você contou…',
  'Calculando calorias e macros…',
];
const CHECKING_MESSAGES = [
  'Olhando o prato…',
  'Conferindo o que você contou…',
  'Vendo se falta algo…',
];

export function NewMealPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('photo');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [audio, setAudio] = useState<Blob | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [answersAudio, setAnswersAudio] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      const blob = await compressPhoto(file);
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setError('Não consegui abrir esta imagem. Tente outra foto.');
    } finally {
      setPreparing(false);
    }
  }

  function fail(err: unknown) {
    setError(err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.');
    // "Não é comida" volta para a foto; o resto volta para a descrição.
    setStep(err instanceof ApiError && err.status === 422 ? 'photo' : 'describe');
  }

  /** Descrição pronta: a IA decide se precisa perguntar algo antes de estimar. */
  async function check() {
    if (!photo) return;
    setError(null);
    setStep('checking');
    try {
      const res = await mealsApi.questions({ photo, description: description.trim(), audio });
      if (res.questions.length === 0) return void analyze([]);
      setQuestions(res.questions);
      setAnswers(res.questions.map(() => ''));
      setAnswersAudio(null);
      setStep('questions');
    } catch (err) {
      fail(err);
    }
  }

  async function analyze(qs: Question[]) {
    if (!photo) return;
    setError(null);
    setStep('analyzing');
    try {
      const meal = await mealsApi.create({
        photo,
        description: description.trim() || undefined,
        audio,
        clarifications: qs.map((q, i) => ({ question: q.question, answer: answers[i] ?? '' })),
        answersAudio: qs.length ? answersAudio : null,
      });
      navigate(`/refeicoes/${meal.id}`, { replace: true });
    } catch (err) {
      fail(err);
    }
  }

  return (
    // Fluxo focado: largura confortável e centralizada também no computador.
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-leaf-50"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-extrabold">Nova refeição</h1>
      </div>

      <Stepper current={step} />

      {error && (
        <p className="rounded-xl bg-tomato-100 px-4 py-3 text-sm text-tomato-600">{error}</p>
      )}

      {step === 'photo' && (
        <PhotoStep
          preview={preview}
          preparing={preparing}
          onPick={onPick}
          onNext={() => setStep('describe')}
        />
      )}

      {step === 'describe' && preview && (
        <section className="space-y-4">
          <img src={preview} alt="" className="h-40 w-full rounded-2xl object-cover" />
          <div>
            <label htmlFor="desc" className="font-bold">
              Conte sobre a refeição
            </label>
            <p className="text-sm text-muted">
              Escreva, grave um áudio ou os dois. Opcional, mas melhora muito a estimativa: preparo,
              quantidade, o que não aparece na foto.
            </p>
          </div>
          <textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ex.: arroz integral, feijão e frango grelhado no azeite. Comi tudo."
            className="w-full rounded-2xl border border-leaf-100 bg-white px-4 py-3 outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-100"
          />
          <div className="flex flex-wrap gap-2">
            {HINTS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() =>
                  setDescription((d) => (d ? `${d.trim()} ${h.toLowerCase()}.` : `${h}.`))
                }
                className="rounded-full border border-leaf-100 bg-white px-3 py-1.5 text-sm text-muted hover:border-leaf-500 hover:text-ink"
              >
                + {h}
              </button>
            ))}
          </div>
          <AudioRecorder audio={audio} onChange={setAudio} />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('photo')}
              className="rounded-2xl border border-leaf-100 bg-white px-5 py-3.5 font-semibold"
            >
              Trocar foto
            </button>
            <button
              type="button"
              onClick={() => void check()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-leaf-600 py-3.5 font-bold text-white hover:bg-leaf-700"
            >
              <Sparkles className="h-5 w-5" /> Continuar
            </button>
          </div>
        </section>
      )}

      {step === 'checking' && preview && <Working preview={preview} messages={CHECKING_MESSAGES} />}

      {step === 'questions' && (
        <section className="space-y-5">
          <div className="flex gap-3 rounded-2xl bg-leaf-50 p-4">
            <MessageCircleQuestion className="h-6 w-6 shrink-0 text-leaf-600" />
            <p className="text-sm text-leaf-900">
              Antes de calcular, a IA quer saber{' '}
              {questions.length === 1 ? 'uma coisa' : 'algumas coisas'} que mudam bastante o
              resultado. Responda o que souber.
            </p>
          </div>
          {questions.map((q, i) => (
            <fieldset key={q.question} className="space-y-2">
              <legend className="font-bold">{q.question}</legend>
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setAnswers((a) => a.map((v, j) => (j === i ? o : v)))}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      answers[i] === o
                        ? 'border-leaf-600 bg-leaf-600 font-semibold text-white'
                        : 'border-leaf-100 bg-white text-ink hover:border-leaf-500'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <input
                value={answers[i] ?? ''}
                onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder="Ou escreva a resposta"
                maxLength={500}
                className="w-full rounded-xl border border-leaf-100 bg-white px-3 py-2 text-sm outline-none focus:border-leaf-500"
              />
            </fieldset>
          ))}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-muted">
              Prefere falar? Responda tudo num áudio:
            </p>
            <AudioRecorder audio={answersAudio} onChange={setAnswersAudio} />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void analyze([])}
              className="rounded-2xl border border-leaf-100 bg-white px-5 py-3.5 font-semibold"
            >
              Pular
            </button>
            <button
              type="button"
              onClick={() => void analyze(questions)}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-leaf-600 py-3.5 font-bold text-white hover:bg-leaf-700"
            >
              <Sparkles className="h-5 w-5" /> Analisar
            </button>
          </div>
        </section>
      )}

      {step === 'analyzing' && preview && (
        <Working preview={preview} messages={ANALYZING_MESSAGES} />
      )}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  // "checking" é a transição entre a descrição e as perguntas.
  const index = STEPS.findIndex((s) => s.key === (current === 'checking' ? 'questions' : current));
  return (
    <ol className="flex gap-2">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex-1">
          <div className={`h-1.5 rounded-full ${i <= index ? 'bg-leaf-600' : 'bg-leaf-100'}`} />
          <span
            className={`mt-1.5 block text-xs font-semibold ${i <= index ? 'text-leaf-700' : 'text-muted'}`}
          >
            {i + 1}. {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PhotoStep(props: {
  preview: string | null;
  preparing: boolean;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  onNext: () => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  return (
    <section className="space-y-4">
      {/* capture abre a câmera traseira no celular; no computador vira um seletor de arquivo. */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={props.onPick}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={props.onPick}
        data-testid="photo-input"
      />

      {props.preview ? (
        <img
          src={props.preview}
          alt="Foto do prato"
          className="aspect-[4/3] max-h-[50vh] w-full rounded-2xl object-cover"
        />
      ) : (
        <button
          type="button"
          onClick={() => gallery.current?.click()}
          className="grid aspect-[4/3] max-h-[50vh] w-full place-items-center rounded-2xl border-2 border-dashed border-leaf-100 bg-white text-center hover:border-leaf-500"
        >
          <div>
            <ImagePlus className="mx-auto h-12 w-12 text-leaf-500" />
            <p className="mt-3 font-bold">Mande uma foto do prato</p>
            <p className="mt-1 px-6 text-sm text-muted">
              De cima ou levemente inclinada, com o prato inteiro aparecendo.
            </p>
          </div>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => camera.current?.click()}
          disabled={props.preparing}
          className="flex items-center justify-center gap-2 rounded-2xl border border-leaf-100 bg-white py-3.5 font-semibold hover:border-leaf-500"
        >
          <Camera className="h-5 w-5" /> Tirar foto
        </button>
        <button
          type="button"
          onClick={() => gallery.current?.click()}
          disabled={props.preparing}
          className="flex items-center justify-center gap-2 rounded-2xl border border-leaf-100 bg-white py-3.5 font-semibold hover:border-leaf-500"
        >
          {props.preview ? <RefreshCw className="h-5 w-5" /> : <ImagePlus className="h-5 w-5" />}
          {props.preview ? 'Trocar' : 'Galeria'}
        </button>
      </div>

      <button
        type="button"
        onClick={props.onNext}
        disabled={!props.preview || props.preparing}
        className="w-full rounded-2xl bg-leaf-600 py-4 text-lg font-bold text-white hover:bg-leaf-700 disabled:opacity-40"
      >
        {props.preparing ? 'Preparando foto…' : 'Continuar'}
      </button>
    </section>
  );
}

function Working({ preview, messages }: { preview: string; messages: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % messages.length), 2200);
    return () => clearInterval(t);
  }, [messages]);

  return (
    <section className="space-y-5 text-center">
      <div className="relative overflow-hidden rounded-2xl">
        <img src={preview} alt="" className="aspect-[4/3] max-h-[50vh] w-full object-cover" />
        <div className="absolute inset-0 bg-leaf-900/30" />
        <div className="scan-line absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-white/50 to-transparent" />
      </div>
      <div>
        <p className="flex items-center justify-center gap-2 text-lg font-bold">
          <Sparkles className="h-5 w-5 animate-pulse text-leaf-600" /> {messages[i]}
        </p>
        <p className="mt-1 text-sm text-muted">A IA está olhando a foto e o que você contou.</p>
      </div>
    </section>
  );
}
