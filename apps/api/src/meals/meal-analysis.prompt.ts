import { z } from 'zod';
import type { InlineFile } from '../gemini/gemini.service';

/**
 * Prompt da análise de refeição (foto + descrição → alimentos e nutrientes).
 *
 * Cada versão que muda o comportamento vai para o REGISTRO-ATIVIDADE.md da
 * disciplina, com o motivo da mudança.
 *
 * v1 — foto + texto, saída estruturada por alimento.
 * v2 — aceita também um áudio com a descrição falada; o modelo transcreve o
 *      áudio na mesma chamada (campo transcript), sem serviço de voz à parte.
 * v3 — usa as respostas às perguntas de esclarecimento (texto ou áudio) e
 *      separa a unidade: ml para bebidas, g para o resto.
 * v4 — proíbe inventar transcrição: num teste com áudio mudo, o modelo
 *      reserva criou uma fala inteira e mudou o prato por causa dela.
 */
export const MEAL_ANALYSIS_SYSTEM = `Você é o Pratômetro, um nutricionista que estima calorias e macronutrientes a partir da foto de um prato de comida e do que a pessoa conta sobre ele, por texto, por áudio ou pelos dois.

Como trabalhar:
1. Olhe a foto e identifique cada alimento separado no prato (arroz, feijão, carne, salada, molho, bebida visível...). Use os nomes comuns no Brasil.
2. Estime a porção de cada alimento usando referências visuais: tamanho do prato (um prato raso tem cerca de 26 cm), talheres, mãos, copos e embalagens. Use gramas (unit "g") para comida e mililitros (unit "ml") para bebidas.
3. Leia a descrição escrita e ouça o áudio, se houver. Os dois valem como descrição e se completam. Quando a descrição contradiz a foto, a descrição vence: modo de preparo (frito, no azeite, com manteiga), ingredientes que não aparecem (óleo, açúcar, molho), quantidades ("comi metade", "2 colheres de arroz") e itens fora da foto ("tomei um suco de laranja"). Inclua os itens que a pessoa citou mesmo que não estejam na foto.
4. Se houver perguntas de esclarecimento já respondidas, as respostas valem tanto quanto a descrição. Uma resposta pode vir por áudio.
5. Calcule kcal, proteína, carboidratos e gordura de cada item para a porção estimada, com base em tabelas de composição como a TACO. Considere o preparo: o óleo de fritura ou de refogado entra na conta.
6. Dê a confiança de cada item: HIGH quando o alimento e a porção estão claros; MEDIUM quando um dos dois é incerto; LOW quando é um palpite (alimento escondido, coberto por molho, foto ruim).
7. Em notes, explique em 1 a 3 frases curtas o que você considerou da descrição e das respostas e o que ficou incerto. Fale direto com a pessoa ("você"), sem jargão.
8. Se veio o áudio da descrição, escreva em transcript a transcrição fiel do que a pessoa falou, em português, sem resumir. Se veio o áudio das respostas, faça o mesmo em answersTranscript. Transcreva apenas a fala que você realmente ouve. NUNCA invente, complete ou deduza uma fala: se o áudio estiver mudo, com ruído ou incompreensível, deixe o campo vazio, ignore esse áudio na estimativa e avise em notes. Sem áudio, o campo fica vazio.

Se a foto não for de comida, responda isFood = false, items vazio, e explique em notes.
Não finja precisão: arredonde gramas e ml para múltiplos de 5 e kcal para números inteiros.`;

export const mealAnalysisSchema = z.object({
  isFood: z.boolean().describe('A foto mostra comida ou bebida?'),
  title: z.string().describe('Nome curto do prato, ex.: "Arroz, feijão e bife acebolado"'),
  items: z
    .array(
      z.object({
        name: z.string().describe('Nome do alimento, ex.: "Arroz branco"'),
        grams: z.number().describe('Porção estimada, na unidade de unit'),
        unit: z.enum(['g', 'ml']).describe('"ml" para bebidas, "g" para o resto'),
        kcal: z.number(),
        protein: z.number().describe('Proteína em gramas'),
        carbs: z.number().describe('Carboidratos em gramas'),
        fat: z.number().describe('Gordura em gramas'),
        confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      }),
    )
    .describe('Um item por alimento identificado'),
  notes: z.string().describe('O que foi considerado da descrição e o que ficou incerto'),
  transcript: z.string().describe('Transcrição fiel do áudio da descrição; vazio se não houve'),
  answersTranscript: z
    .string()
    .describe('Transcrição fiel do áudio das respostas; vazio se não houve'),
});
export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;

export interface Clarification {
  question: string;
  answer: string;
}

export interface MealInputs {
  photo: InlineFile;
  description?: string;
  audio?: InlineFile;
  clarifications?: Clarification[];
  answersAudio?: InlineFile;
}

/**
 * Conteúdo da chamada, com um rótulo de texto antes de cada arquivo: com dois
 * áudios (descrição e respostas) o modelo precisa saber qual é qual.
 */
export function mealParts(input: MealInputs): (string | InlineFile)[] {
  const parts: (string | InlineFile)[] = ['Foto da refeição:', input.photo];

  if (input.description) {
    parts.push(`O que a pessoa escreveu sobre a refeição:\n"""${input.description}"""`);
  }
  if (input.audio) parts.push('Áudio da pessoa falando sobre a refeição:', input.audio);
  if (!input.description && !input.audio) {
    parts.push('A pessoa não descreveu a refeição; use só a foto.');
  }

  const answered = (input.clarifications ?? []).filter((c) => c.answer.trim());
  if (answered.length || input.answersAudio) {
    parts.push(
      'Perguntas de esclarecimento já feitas à pessoa:\n' +
        (input.clarifications ?? [])
          .map(
            (c, i) =>
              `${i + 1}. ${c.question}\n   Resposta: ${c.answer.trim() || '(sem resposta escrita)'}`,
          )
          .join('\n'),
    );
  }
  if (input.answersAudio) {
    parts.push('Áudio da pessoa respondendo às perguntas:', input.answersAudio);
  }
  return parts;
}
