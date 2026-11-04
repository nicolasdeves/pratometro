import { Mic, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SilentAudioError, toWav } from '../lib/audio';

const MAX_SECONDS = 60;

interface Props {
  audio: Blob | null;
  onChange: (audio: Blob | null) => void;
}

type State = 'idle' | 'recording' | 'converting';

/** Grava a descrição falada (até 1 min) e entrega um WAV pronto para enviar. */
export function AudioRecorder({ audio, onChange }: Props) {
  const [state, setState] = useState<State>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!audio) return setUrl(null);
    const u = URL.createObjectURL(audio);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [audio]);

  // Sai da tela gravando: solta o microfone.
  useEffect(() => () => stopTracks(), []);

  function stopTracks() {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Não consegui acessar o microfone. Libere a permissão no navegador.');
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stopTracks();
      setState('converting');
      try {
        onChange(await toWav(new Blob(chunks, { type: rec.mimeType })));
      } catch (err) {
        setError(
          err instanceof SilentAudioError
            ? 'Não deu para ouvir nada. Confira o microfone e grave de novo.'
            : 'Não consegui processar o áudio. Tente gravar de novo.',
        );
      }
      setState('idle');
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState('recording');
    timer.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) rec.stop();
        return s + 1;
      });
    }, 1000);
  }

  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  const mmss = `0:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="space-y-2">
      {audio && url ? (
        <div className="flex items-center gap-2 rounded-2xl border border-leaf-100 bg-white p-2 pl-4">
          <Mic className="h-5 w-5 shrink-0 text-leaf-600" />
          <audio src={url} controls className="h-10 min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-tomato-100 hover:text-tomato-600"
            aria-label="Apagar áudio"
            title="Apagar áudio"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      ) : state === 'recording' ? (
        <button
          type="button"
          onClick={stop}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-tomato-500 py-3.5 font-bold text-white"
        >
          <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
          Gravando {mmss} — toque para parar
          <Square className="h-4 w-4 fill-white" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={state === 'converting'}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-leaf-100 bg-white py-3.5 font-semibold hover:border-leaf-500 disabled:opacity-50"
        >
          <Mic className="h-5 w-5 text-leaf-600" />
          {state === 'converting' ? 'Preparando áudio…' : 'Gravar áudio'}
        </button>
      )}
      {error && <p className="text-sm text-tomato-600">{error}</p>}
    </div>
  );
}
