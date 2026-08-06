// Fase 7 — Regras por tipo de curso.
// Enum interno mapeado pra label e CH minima.
// CH minima idealmente vem de `regras_params.ch_minima_por_tipo` do tenant,
// mas os defaults abaixo espelham a decisao do usuario (5/ago/2026).

export type TipoCurso = "pos_graduacao" | "curso_livre" | "gmp" | "diplomado";

export const TIPO_CURSO_LABEL: Record<TipoCurso, string> = {
  pos_graduacao: "Pós-Graduação",
  curso_livre: "Curso Livre",
  gmp: "GMP",
  diplomado: "Diplomado",
};

export const TIPO_CURSO_DESC: Record<TipoCurso, string> = {
  pos_graduacao: "Requer no mínimo 360 horas totais",
  curso_livre: "Sem exigência de carga horária mínima",
  gmp: "Sem exigência de carga horária mínima",
  diplomado: "Sem exigência de carga horária mínima",
};

// CH minima default (fallback quando regras_params nao tem o override
// pro tenant). User definiu: 360h pra pos-graduacao, 0 pros outros.
export const CH_MINIMA_DEFAULT: Record<TipoCurso, number> = {
  pos_graduacao: 360,
  curso_livre: 0,
  gmp: 0,
  diplomado: 0,
};

export const TIPOS_CURSO_ORDENADOS: Array<{ valor: TipoCurso; label: string; desc: string }> =
  (Object.keys(TIPO_CURSO_LABEL) as TipoCurso[]).map((t) => ({
    valor: t,
    label: TIPO_CURSO_LABEL[t],
    desc: TIPO_CURSO_DESC[t],
  }));

export interface ValidacaoCH {
  ok: boolean;
  ch_total: number;
  ch_minima: number;
  faltam: number;
  mensagem?: string;
}

export function validarChMinima(
  tipo: TipoCurso,
  chTotal: number,
  chMinima: number = CH_MINIMA_DEFAULT[tipo],
): ValidacaoCH {
  if (chMinima <= 0) {
    return { ok: true, ch_total: chTotal, ch_minima: 0, faltam: 0 };
  }
  const faltam = Math.max(0, chMinima - chTotal);
  if (faltam === 0) {
    return { ok: true, ch_total: chTotal, ch_minima: chMinima, faltam: 0 };
  }
  return {
    ok: false,
    ch_total: chTotal,
    ch_minima: chMinima,
    faltam,
    mensagem: `${TIPO_CURSO_LABEL[tipo]} exige no mínimo ${chMinima}h. Faltam ${faltam}h (total atual: ${chTotal}h). Ajuste as disciplinas antes de enviar.`,
  };
}
