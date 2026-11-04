/**
 * Diz se um WAV PCM 16-bit está praticamente mudo (pico abaixo de -40 dBFS).
 *
 * Existe por causa de um teste: com um áudio em silêncio, o modelo reserva
 * inventou uma transcrição inteira ("hoje eu almocei... hambúrguer com milho")
 * e mudou o prato por causa dela. Áudio mudo nem chega à IA.
 *
 * Outros formatos (ou WAV fora do padrão) retornam false: na dúvida, envia.
 */
export function isSilentWav(buf: Buffer, peakThreshold = 0.01): boolean {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return false;
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return false;

  let offset = 12;
  let bitsPerSample = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (buf.readUInt16LE(body) !== 1) return false; // só PCM
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      if (bitsPerSample !== 16) return false;
      const end = Math.min(buf.length, body + size);
      let peak = 0;
      for (let i = body; i + 1 < end; i += 2) {
        const v = Math.abs(buf.readInt16LE(i));
        if (v > peak) peak = v;
      }
      return peak / 32768 < peakThreshold;
    }
    offset = body + size + (size % 2);
  }
  return false;
}
