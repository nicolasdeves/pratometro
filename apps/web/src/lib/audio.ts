const SAMPLE_RATE = 16_000;

/**
 * Converte a gravação do navegador (WebM/Opus no Chrome, MP4/AAC no Safari)
 * para WAV mono 16 kHz. O Gemini aceita WAV de qualquer origem; WebM não está
 * na lista oficial. 16 kHz mono é o que a fala precisa: 1 min ≈ 1,9 MB.
 */
export async function toWav(recording: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await recording.arrayBuffer());
  await ctx.close();

  const frames = Math.ceil(decoded.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const mono = (await offline.startRendering()).getChannelData(0);

  let peak = 0;
  for (const s of mono) peak = Math.max(peak, Math.abs(s));
  // Pico abaixo de -40 dBFS: microfone mudo ou longe demais. A API recusa o
  // mesmo caso; aqui a pessoa descobre antes de enviar.
  if (peak < 0.01) throw new SilentAudioError();

  return new Blob([wavHeader(mono.length), floatTo16Bit(mono)], { type: 'audio/wav' });
}

export class SilentAudioError extends Error {
  constructor() {
    super('Áudio mudo');
    this.name = 'SilentAudioError';
  }
}

function floatTo16Bit(samples: Float32Array): ArrayBuffer {
  const out = new DataView(new ArrayBuffer(samples.length * 2));
  samples.forEach((s, i) => {
    const v = Math.max(-1, Math.min(1, s));
    out.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  });
  return out.buffer;
}

function wavHeader(sampleCount: number): ArrayBuffer {
  const dataSize = sampleCount * 2;
  const h = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, s: string) =>
    [...s].forEach((c, i) => h.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  h.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  h.setUint32(16, 16, true); // tamanho do bloco fmt
  h.setUint16(20, 1, true); // PCM
  h.setUint16(22, 1, true); // mono
  h.setUint32(24, SAMPLE_RATE, true);
  h.setUint32(28, SAMPLE_RATE * 2, true); // bytes por segundo
  h.setUint16(32, 2, true); // bytes por amostra
  h.setUint16(34, 16, true); // bits por amostra
  ascii(36, 'data');
  h.setUint32(40, dataSize, true);
  return h.buffer;
}
