// Fase 12.5 — Rótulos amigáveis pros tipos de solicitação. Espelha o
// enum `tipo_solicitacao` do banco (migration 20260807000000). O enum
// interno continua sendo o cru (`alterar_data_live`); só a UI usa o
// label.

export type TipoSolicitacao =
  | "gerar_ano"
  | "nova_oferta"
  | "novo_curso"
  | "reordenar_carrossel"
  | "cancelar_oferta"
  | "alterar_data_live"
  | "alterar_data_termino"
  | "alterar_data_correcao"
  | "alterar_data_inicio"
  // Legacy — não devem mais aparecer em novas solicitações, mas ficam
  // aqui pra a lista renderizar bem os históricos antigos.
  | "ajuste_ancora"
  | "ajuste_manual";

export const TIPO_LABEL_PT: Record<TipoSolicitacao, string> = {
  gerar_ano: "Gerar ano",
  nova_oferta: "Nova oferta",
  novo_curso: "Abertura de curso",
  reordenar_carrossel: "Reordenar disciplinas",
  cancelar_oferta: "Cancelar oferta",
  alterar_data_live: "Alterar data de live",
  alterar_data_termino: "Alterar data de término",
  alterar_data_correcao: "Alterar data de correção",
  alterar_data_inicio: "Alterar data de início",
  ajuste_ancora: "Ajuste de âncora",
  ajuste_manual: "Ajuste manual",
};

export const TIPO_LABEL_ES: Record<TipoSolicitacao, string> = {
  gerar_ano: "Generar año",
  nova_oferta: "Nueva oferta",
  novo_curso: "Apertura de curso",
  reordenar_carrossel: "Reordenar disciplinas",
  cancelar_oferta: "Cancelar oferta",
  alterar_data_live: "Cambiar fecha de vivo",
  alterar_data_termino: "Cambiar fecha de fin",
  alterar_data_correcao: "Cambiar fecha de corrección",
  alterar_data_inicio: "Cambiar fecha de inicio",
  ajuste_ancora: "Ajuste de ancla",
  ajuste_manual: "Ajuste manual",
};

export function labelTipoSolicitacao(tipo: string, idioma: "pt" | "es" = "pt"): string {
  const map = idioma === "es" ? TIPO_LABEL_ES : TIPO_LABEL_PT;
  return map[tipo as TipoSolicitacao] ?? tipo;
}
