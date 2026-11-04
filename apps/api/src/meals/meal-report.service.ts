import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { MealsService } from './meals.service';
import type { PlanFeedback } from '../plan/plan.prompts';

// Mesmas cores do app (apps/web/src/index.css).
const GREEN = '#1f7a4d';
const GREEN_LIGHT = '#eef8f1';
const GREEN_LINE = '#d6efdf';
const TOMATO = '#d9532a';
const AMBER = '#b7791f';
const CREAM = '#fdf8ef';
const INK = '#1d2a24';
const MUTED = '#5f6f67';

const MARGIN = 44;
const FOOTER_SPACE = 48;

const CONFIDENCE: Record<string, { label: string; color: string }> = {
  HIGH: { label: 'Alta', color: GREEN },
  MEDIUM: { label: 'Média', color: AMBER },
  LOW: { label: 'Palpite', color: TOMATO },
};
const VERDICT: Record<string, { label: string; color: string }> = {
  ok: { label: 'Dentro do plano', color: GREEN },
  above: { label: 'Acima do plano', color: TOMATO },
  below: { label: 'Abaixo do plano', color: AMBER },
  off: { label: 'Fora do plano', color: TOMATO },
};
// kcal por grama: a barra mostra a fatia de energia de cada macro, como no app.
const MACROS = [
  { key: 'protein', label: 'Proteína', kcalPerG: 4, color: '#2c9a63' },
  { key: 'carbs', label: 'Carboidratos', kcalPerG: 4, color: '#f2b233' },
  { key: 'fat', label: 'Gordura', kcalPerG: 9, color: '#f2683c' },
] as const;

interface Clarifications {
  items?: { question: string; answer: string }[];
  audioTranscript?: string;
}

type Doc = PDFKit.PDFDocument;

/**
 * Relatório em PDF de uma refeição: a saída "em outro formato" do fluxo.
 * Gerado na hora a partir do que está salvo (nada de arquivo guardado).
 */
@Injectable()
export class MealReportService {
  constructor(
    private readonly meals: MealsService,
    private readonly prisma: PrismaService,
  ) {}

  async render(userId: string, id: string) {
    const meal = await this.meals.get(userId, id);
    const { photo } = await this.meals.photo(userId, id);
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    // bufferPages: o rodapé (com "página X de Y") é desenhado no fim, em todas.
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
      bufferPages: true,
      info: { Title: meal.title },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const left = MARGIN;
    const width = doc.page.width - MARGIN * 2;
    const when = meal.eatenAt.toLocaleString('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });

    // ── Cabeçalho ───────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 78).fill(GREEN);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Pratômetro', left, 22);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(GREEN_LINE)
      .text('Relatório da refeição', left, 50);
    doc
      .fontSize(9)
      .fillColor('white')
      .text(user?.name ?? user?.email ?? '', left, 28, { width, align: 'right' })
      .fillColor(GREEN_LINE)
      .text(when, left, 44, { width, align: 'right' });

    // ── Foto + resumo ───────────────────────────────────────
    const top = 102;
    const photoSize = 196;
    doc.save();
    doc.roundedRect(left, top, photoSize, photoSize, 12).clip();
    try {
      // cover redimensiona para cobrir a caixa, mas não corta: o clip acima corta.
      doc.image(Buffer.from(photo), left, top, {
        cover: [photoSize, photoSize],
        align: 'center',
        valign: 'center',
      });
    } catch {
      doc.rect(left, top, photoSize, photoSize).fill(GREEN_LIGHT);
    }
    doc.restore();

    const sx = left + photoSize + 22;
    const sw = width - photoSize - 22;
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(INK)
      .text(meal.title, sx, top + 2, {
        width: sw,
      });
    doc.moveDown(0.25);
    doc
      .font('Helvetica-Bold')
      .fontSize(34)
      .fillColor(TOMATO)
      .text(`${r(meal.kcal)} kcal`, sx);

    // Cartões dos macros
    const cardY = doc.y + 8;
    const gap = 8;
    const cardW = (sw - gap * 2) / 3;
    MACROS.forEach((m, i) => {
      const x = sx + i * (cardW + gap);
      doc.roundedRect(x, cardY, cardW, 48, 8).fill(CREAM);
      doc.circle(x + 12, cardY + 15, 3).fill(m.color);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(m.label, x + 19, cardY + 11);
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(INK)
        .text(`${r(meal[m.key])} g`, x + 10, cardY + 25);
    });

    // Barra de energia por macro
    const barY = cardY + 60;
    const energy = MACROS.map((m) => meal[m.key] * m.kcalPerG);
    const total = energy.reduce((a, b) => a + b, 0) || 1;
    doc.save();
    doc.roundedRect(sx, barY, sw, 8, 4).clip();
    let bx = sx;
    MACROS.forEach((m, i) => {
      const w = (energy[i] / total) * sw;
      doc.rect(bx, barY, w, 8).fill(m.color);
      bx += w;
    });
    doc.restore();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text('Fatia das calorias vinda de cada macronutriente', sx, barY + 13, { width: sw });

    doc.y = Math.max(top + photoSize, doc.y) + 22;

    // ── Tabela de alimentos ─────────────────────────────────
    section(doc, 'O que tinha no prato');
    const cols = [
      { h: 'Alimento', w: 0.34, align: 'left' },
      { h: 'Porção', w: 0.12, align: 'right' },
      { h: 'kcal', w: 0.1, align: 'right' },
      { h: 'Prot.', w: 0.1, align: 'right' },
      { h: 'Carb.', w: 0.1, align: 'right' },
      { h: 'Gord.', w: 0.1, align: 'right' },
      { h: 'Confiança', w: 0.14, align: 'right' },
    ] as const;
    const pad = 8;
    const row = (cells: string[], opts: { header?: boolean; fill?: string; colors?: string[] }) => {
      doc.font(opts.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.header ? 8.5 : 9.5);
      const heights = cells.map((c, i) =>
        doc.heightOfString(c, { width: cols[i].w * width - pad * 2 }),
      );
      const h = Math.max(...heights) + 12;
      ensureSpace(doc, h);
      const y = doc.y;
      if (opts.fill) doc.roundedRect(left, y, width, h, 6).fill(opts.fill);
      let x = left;
      cells.forEach((c, i) => {
        doc
          // Confiança (última coluna) em negrito, na cor do nível.
          .font(opts.header || i === cells.length - 1 ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(opts.colors?.[i] ?? (opts.header ? MUTED : INK))
          .text(c, x + pad, y + 6, { width: cols[i].w * width - pad * 2, align: cols[i].align });
        x += cols[i].w * width;
      });
      doc.y = y + h;
    };
    row(
      cols.map((c) => c.h),
      { header: true, fill: GREEN_LIGHT },
    );
    meal.items.forEach((it, i) => {
      const conf = CONFIDENCE[it.confidence] ?? { label: it.confidence, color: INK };
      const colors: string[] = [INK, INK, INK, INK, INK, INK, conf.color];
      row(
        [
          it.name,
          `${r(it.grams)} ${it.unit}`,
          `${r(it.kcal)}`,
          `${r(it.protein)} g`,
          `${r(it.carbs)} g`,
          `${r(it.fat)} g`,
          conf.label,
        ],
        { fill: i % 2 ? CREAM : undefined, colors },
      );
    });
    // Linha de total
    row(
      [
        'Total',
        '',
        `${r(meal.kcal)}`,
        `${r(meal.protein)} g`,
        `${r(meal.carbs)} g`,
        `${r(meal.fat)} g`,
        '',
      ],
      { header: true, colors: [INK, INK, TOMATO, INK, INK, INK, INK] },
    );

    const adjusted = meal.items.filter((it) => r(it.grams) !== r(it.aiGrams));
    if (adjusted.length) {
      doc
        .moveDown(0.4)
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(
          'Porções ajustadas por você: ' +
            adjusted
              .map((it) => `${it.name} (a IA estimou ${r(it.aiGrams)} ${it.unit})`)
              .join('; '),
          left,
          doc.y,
          { width },
        );
    }

    // ── O que a pessoa contou ───────────────────────────────
    if (meal.description || meal.transcript) {
      section(doc, 'O que você contou');
      if (meal.description) quote(doc, 'Por escrito', meal.description);
      if (meal.transcript) quote(doc, 'Por áudio (transcrição)', meal.transcript);
    }

    const clar = meal.clarifications as Clarifications | null;
    if (clar?.items?.length) {
      section(doc, 'Perguntas da IA');
      for (const c of clar.items) {
        ensureSpace(doc, 34);
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(INK)
          .text(c.question, left, doc.y, { width });
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(MUTED)
          .text(c.answer || '—', left, doc.y + 2, { width });
        doc.moveDown(0.6);
      }
      if (clar.audioTranscript) quote(doc, 'Respostas por áudio', clar.audioTranscript);
    }

    if (meal.notes) {
      section(doc, 'O que a IA considerou');
      box(doc, meal.notes, GREEN_LIGHT);
    }

    const fb = meal.planFeedback as PlanFeedback | null;
    if (fb?.verdict) {
      const v = VERDICT[fb.verdict] ?? { label: fb.verdict, color: INK };
      section(doc, `Comparação com o plano — ${fb.planMealName}`);
      ensureSpace(doc, 30);
      const py = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      const pillW = doc.widthOfString(v.label) + 18;
      doc.roundedRect(left, py, pillW, 18, 9).fill(v.color);
      doc.fillColor('white').text(v.label, left + 9, py + 5);
      doc.y = py + 26;
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(fb.summary, left, doc.y, { width });
      doc.moveDown(0.4);
      for (const s of fb.suggestions) {
        ensureSpace(doc, 20);
        const y = doc.y;
        doc.circle(left + 3, y + 5, 2).fill(GREEN);
        doc.fillColor(INK).text(s, left + 12, y, { width: width - 12 });
        doc.moveDown(0.3);
      }
    }

    // ── Rodapé em todas as páginas ──────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Sem margem de baixo, escrever no rodapé não abre página nova.
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 34;
      doc
        .moveTo(left, y - 8)
        .lineTo(left + width, y - 8)
        .lineWidth(0.5)
        .strokeColor(GREEN_LINE)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(
          'Estimativa feita por inteligência artificial a partir da foto e da descrição. ' +
            'Os valores são aproximados e não substituem a orientação de um nutricionista.',
          left,
          y,
          { width: width - 60, lineBreak: true },
        )
        .text(`${i + 1} / ${range.count}`, left, y, { width, align: 'right' });
    }

    doc.end();
    const date = meal.eatenAt.toISOString().slice(0, 10);
    return { buffer: await done, fileName: `pratometro-${date}.pdf` };
  }
}

const r = Math.round;

/** Abre página nova se `h` pontos não cabem antes do rodapé. */
function ensureSpace(doc: Doc, h: number) {
  if (doc.y + h > doc.page.height - FOOTER_SPACE) {
    doc.addPage();
    doc.y = MARGIN;
  }
}

function section(doc: Doc, title: string) {
  ensureSpace(doc, 60);
  doc.y += 14;
  const y = doc.y;
  doc.roundedRect(MARGIN, y + 1, 4, 13, 2).fill(GREEN);
  doc
    .font('Helvetica-Bold')
    .fontSize(12.5)
    .fillColor(INK)
    .text(title, MARGIN + 12, y);
  doc.y = y + 22;
}

/** Fala da pessoa: caixa creme com uma faixa verde à esquerda. */
function quote(doc: Doc, label: string, text: string) {
  const width = doc.page.width - MARGIN * 2;
  doc.font('Helvetica').fontSize(10);
  const h = doc.heightOfString(`“${text}”`, { width: width - 32 }) + 34;
  ensureSpace(doc, h);
  const y = doc.y;
  doc.roundedRect(MARGIN, y, width, h, 8).fill(CREAM);
  doc.rect(MARGIN, y, 4, h).fill(GREEN);
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(MUTED)
    .text(label.toUpperCase(), MARGIN + 16, y + 9);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(INK)
    .text(`“${text}”`, MARGIN + 16, y + 22, { width: width - 32 });
  doc.y = y + h + 8;
}

function box(doc: Doc, text: string, fill: string) {
  const width = doc.page.width - MARGIN * 2;
  doc.font('Helvetica').fontSize(10);
  const h = doc.heightOfString(text, { width: width - 32 }) + 22;
  ensureSpace(doc, h);
  const y = doc.y;
  doc.roundedRect(MARGIN, y, width, h, 8).fill(fill);
  doc.fillColor(INK).text(text, MARGIN + 16, y + 11, { width: width - 32 });
  doc.y = y + h + 8;
}
