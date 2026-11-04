const MAX_SIDE = 1280;
const QUALITY = 0.82;

/**
 * Reduz a foto no navegador antes do envio: uma foto de celular (4–12 MB) vira
 * um JPEG de ~200 KB. Sobe mais rápido, cabe no Postgres e não piora a análise
 * (o Gemini redimensiona a imagem de qualquer jeito).
 */
export async function compressPhoto(file: File): Promise<Blob> {
  // createImageBitmap já aplica a orientação EXIF (foto "deitada" do celular).
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao converter a foto'))),
      'image/jpeg',
      QUALITY,
    ),
  );
}
