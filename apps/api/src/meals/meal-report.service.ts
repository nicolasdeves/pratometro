import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { MealsService } from './meals.service';
import type { PlanFeedback } from '../plan/plan.prompts';

const GREEN = '#1f7a4d';
const TOMATO = '#d9532a';
const INK = '#1d2a24';
const MUTED = '#5f6f67';
const LINE = '#d6efdf';

const CONFIDENCE: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Palpite' };
const VERDICT: Record<string, string> = {
  ok: 'Dentro do plano',
  above: 'Acima do plano',
  below: 'Abaixo do plano',
  off: 'Fora do plano',
};

interface Clarifications {
  items?: { question: string; answer: string }[];
  audioTranscript?: string;
}

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

    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: meal.title } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const when = meal.eatenAt.toLocaleString('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });

    // Cabeçalho
    doc.rect(0, 0, doc.page.width, 86).fill(GREEN);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Pratômetro', left, 26);
    doc.font('Helvetica').fontSize(11).text('Relatório da refeição', left, 54);
    doc
      .fontSize(9)
      .text(user?.name ?? user?.email ?? '', left, 30, { width, align: 'right' })
      .text(when, left, 46, { width, align: 'right' });

    // Foto + resumo
    const top = 110;
    const photoW = 210;
    const photoH = 158;
    try {
      doc.image(Buffer.from(photo), left, top, { cover: [photoW, photoH] });
    } catch {
      doc.rect(left, top, photoW, photoH).fill(LINE);
    }
    const sx = left + photoW + 20;
    const sw = width - photoW - 20;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(meal.title, sx, top, { width: sw });
    doc
      .moveDown(0.4)
      .fillColor(TOMATO)
      .fontSize(30)
      .text(`${Math.round(meal.kcal)} kcal`, sx);
    doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor(MUTED);
    for (const [label, v] of [
      ['Proteína', meal.protein],
      ['Carboidratos', meal.carbs],
      ['Gordura', meal.fat],
    ] as const) {
      doc.text(`${label}: `, sx, doc.y, { continued: true }).fillColor(INK).font('Helvetica-Bold');
      doc
        .text(`${Math.round(v)} g`)
        .font('Helvetica')
        .fillColor(MUTED);
    }

    // Tabela de alimentos
    doc.y = top + photoH + 26;
    section(doc, 'O que tinha no prato', left);
    const cols = [
      { h: 'Alimento', w: 0.36 },
      { h: 'Porção', w: 0.12 },
      { h: 'kcal', w: 0.1 },
      { h: 'Prot.', w: 0.1 },
      { h: 'Carb.', w: 0.1 },
      { h: 'Gord.', w: 0.1 },
      { h: 'Confiança', w: 0.12 },
    ];
    const row = (cells: string[], bold = false) => {
      const y = doc.y;
      let x = left;
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9.5)
        .fillColor(bold ? MUTED : INK);
      let h = 0;
      cells.forEach((c, i) => {
        const w = cols[i].w * width;
        doc.text(c, x, y, { width: w - 6 });
        h = Math.max(h, doc.y - y);
        x += w;
      });
      doc.y = y + h + 5;
      doc
        .moveTo(left, doc.y - 2)
        .lineTo(left + width, doc.y - 2)
        .strokeColor(LINE)
        .stroke();
    };
    row(
      cols.map((c) => c.h),
      true,
    );
    for (const it of meal.items) {
      row([
        it.name,
        `${Math.round(it.grams)} ${it.unit}`,
        `${Math.round(it.kcal)}`,
        `${Math.round(it.protein)} g`,
        `${Math.round(it.carbs)} g`,
        `${Math.round(it.fat)} g`,
        CONFIDENCE[it.confidence] ?? it.confidence,
      ]);
    }
    const adjusted = meal.items.filter((it) => Math.round(it.grams) !== Math.round(it.aiGrams));
    if (adjusted.length) {
      doc
        .moveDown(0.3)
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(
          'Porções ajustadas pela pessoa: ' +
            adjusted
              .map((it) => `${it.name} (IA: ${Math.round(it.aiGrams)} ${it.unit})`)
              .join('; '),
          left,
          doc.y,
          { width },
        );
    }

    // O que a pessoa contou
    if (meal.description || meal.transcript) {
      section(doc, 'O que você contou', left);
      if (meal.description) paragraph(doc, `Por escrito: “${meal.description}”`, left, width);
      if (meal.transcript) paragraph(doc, `Por áudio: “${meal.transcript}”`, left, width);
    }

    const clar = meal.clarifications as Clarifications | null;
    if (clar?.items?.length) {
      section(doc, 'Perguntas da IA', left);
      for (const c of clar.items) {
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(INK)
          .text(c.question, left, doc.y, { width });
        paragraph(doc, c.answer || '—', left, width);
      }
      if (clar.audioTranscript) {
        paragraph(doc, `Respostas por áudio: “${clar.audioTranscript}”`, left, width);
      }
    }

    if (meal.notes) {
      section(doc, 'O que a IA considerou', left);
      paragraph(doc, meal.notes, left, width);
    }

    const fb = meal.planFeedback as PlanFeedback | null;
    if (fb) {
      section(doc, `Comparação com o plano alimentar — ${VERDICT[fb.verdict] ?? fb.verdict}`, left);
      paragraph(doc, fb.summary, left, width);
      for (const s of fb.suggestions) paragraph(doc, `• ${s}`, left, width);
    }

    // Aviso no rodapé da última página (ou numa nova, se o conteúdo chegou lá).
    const footerY = doc.page.height - doc.page.margins.bottom - 24;
    if (doc.y > footerY - 12) doc.addPage();
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `Estimativa feita por inteligência artificial a partir da foto e da descrição. ` +
          'Os valores são aproximados e não substituem a orientação de um nutricionista.',
        left,
        footerY,
        { width, height: 24 },
      );

    doc.end();
    const date = meal.eatenAt.toISOString().slice(0, 10);
    return { buffer: await done, fileName: `pratometro-${date}.pdf` };
  }
}

function section(doc: PDFKit.PDFDocument, title: string, left: number) {
  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.moveDown(0.9).font('Helvetica-Bold').fontSize(12).fillColor(GREEN).text(title, left, doc.y);
  doc.moveDown(0.3);
}

function paragraph(doc: PDFKit.PDFDocument, text: string, left: number, width: number) {
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(text, left, doc.y, { width });
  doc.moveDown(0.4);
}
