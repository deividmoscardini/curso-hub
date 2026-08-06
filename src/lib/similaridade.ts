// Fase 7 — Similaridade de strings pra detectar duplicatas estruturais
// de disciplinas (A4/A5). Approach: normaliza (lowercase, sem acento,
// sem pontuacao, sem stopwords) e calcula Jaccard sobre tokens.
// Threshold default = 0.5 (50%), conforme decisao da reuniao.

const STOPWORDS_PT = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "na",
  "no", "nas", "nos", "para", "pra", "com", "sem", "por", "ao", "aos",
  "à", "as", "à", "às", "que", "se", "um", "uma", "uns", "umas",
]);

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")     // pontuação vira espaço
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS_PT.has(t));
}

/** Jaccard: |A ∩ B| / |A ∪ B| — 0 (disjuntos) a 1 (iguais). */
export function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return inter / union;
}

export interface CandidataSimilar<T> {
  item: T;
  score: number;
}

export function acharSimilar<T>(
  alvo: string,
  candidatos: Array<{ item: T; nome: string }>,
  threshold: number = 0.5,
): CandidataSimilar<T>[] {
  return candidatos
    .map((c) => ({ item: c.item, score: jaccard(alvo, c.nome) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
