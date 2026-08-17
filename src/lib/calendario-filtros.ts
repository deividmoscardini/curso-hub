// Fase 11.9 — Definições tipadas dos filtros de calendário, função de
// filtragem e distinct de opções. Substitui os filtros por-input do
// header (Fase 11.7) por filtros tipados por coluna, renderizados num
// painel lateral.

import type { AbaCalendario } from "./colunas-calendario";

export type TipoFiltro = "texto" | "multi_select" | "range_numero" | "range_data";
export type SecaoFiltro =
  | "identificacao"
  | "captacao"
  | "aulas"
  | "marcos"
  | "feedback"
  | "entrega_final"
  | "prova"
  | "fechamento";

export interface DefFiltro {
  chave: string;        // chave EXATA no jsonb (mantém quirks do Excel)
  tipo: TipoFiltro;
  secao: SecaoFiltro;
}

// Um estado 4-buckets pra evitar discriminated union verbosa nos
// componentes. Cada bucket é indexado pela chave da coluna (a mesma
// usada em `dados[chave]`).
export interface FiltrosEstado {
  textos: Record<string, string>;
  multis: Record<string, string[]>;
  numeros: Record<string, { de?: number; ate?: number }>;
  datas: Record<string, { de?: string; ate?: string }>;
}

export const filtrosVazios = (): FiltrosEstado => ({
  textos: {},
  multis: {},
  numeros: {},
  datas: {},
});

export const DEFS_POR_ABA: Record<AbaCalendario, DefFiltro[]> = {
  disciplinas: [
    { chave: "ANO",                            tipo: "range_numero", secao: "identificacao" },
    { chave: "ESCOLA",                         tipo: "multi_select", secao: "identificacao" },
    { chave: "SIGLA",                          tipo: "texto",        secao: "identificacao" },
    { chave: "CÓD CURSO",                      tipo: "texto",        secao: "identificacao" },
    { chave: "CURSO",                          tipo: "texto",        secao: "identificacao" },
    { chave: "ORDEM DA DISCIPLINA",            tipo: "range_numero", secao: "identificacao" },
    { chave: "DISCIPLINA",                     tipo: "texto",        secao: "identificacao" },
    { chave: "CÓDIGO DA TURMA ",               tipo: "texto",        secao: "identificacao" },
    { chave: "TIPO DE OFERTA",                 tipo: "multi_select", secao: "identificacao" },
    { chave: "CH",                             tipo: "range_numero", secao: "identificacao" },
    { chave: "ENTRADA CAPTAÇÃO",               tipo: "multi_select", secao: "captacao" },
    { chave: "INÍCIO CAPTAÇÃO",                tipo: "range_data",   secao: "captacao" },
    { chave: "TÉRMINO CAPTAÇÃO",               tipo: "range_data",   secao: "captacao" },
    { chave: "DATA  INÍCIO",                   tipo: "range_data",   secao: "aulas" },
    { chave: "DATA FIM ",                      tipo: "range_data",   secao: "aulas" },
    { chave: "DIA DA SEMANA DA LIVE",          tipo: "multi_select", secao: "aulas" },
    { chave: "LIVE ESTUDO DE CASO (SEMANA 2)", tipo: "range_data",   secao: "marcos" },
    { chave: "LIVE DE FECHAMENTO (SEMANA 3)",  tipo: "range_data",   secao: "marcos" },
    { chave: "QUESTIONÁRIO (SEMANA 4)",        tipo: "range_data",   secao: "marcos" },
  ],
  projeto_aplicacao: [
    { chave: "ANO",                                             tipo: "range_numero", secao: "identificacao" },
    { chave: "OFERTA",                                          tipo: "multi_select", secao: "identificacao" },
    { chave: "SIGLA",                                           tipo: "texto",        secao: "identificacao" },
    { chave: "CÓD. DO CURSO",                                   tipo: "texto",        secao: "identificacao" },
    { chave: "CURSO",                                           tipo: "texto",        secao: "identificacao" },
    { chave: "CH",                                              tipo: "range_numero", secao: "identificacao" },
    { chave: "TURMA",                                           tipo: "texto",        secao: "identificacao" },
    { chave: "DATA INÍCIO",                                     tipo: "range_data",   secao: "aulas" },
    { chave: "DATA FIM ",                                       tipo: "range_data",   secao: "aulas" },
    { chave: "DIA DA SEMANA",                                   tipo: "multi_select", secao: "aulas" },
    { chave: "LIVE 1",                                          tipo: "range_data",   secao: "aulas" },
    { chave: "LIVE 2 ",                                         tipo: "range_data",   secao: "aulas" },
    { chave: "(A) INÍCIO PARA A ENTREGA DO FEEDBACK",           tipo: "range_data",   secao: "feedback" },
    { chave: "(A) FIM PARA A ENTREGA DO FEEDBACK",              tipo: "range_data",   secao: "feedback" },
    { chave: "(P) INÍCIO PARA A CORREÇÃO DO FEEDBACK",          tipo: "range_data",   secao: "feedback" },
    { chave: "(P) FIM PARA A CORREÇÃO DO FEEDBACK",             tipo: "range_data",   secao: "feedback" },
    { chave: "(A) INÍCIO PARA A ENTREGA  FINAL",                tipo: "range_data",   secao: "entrega_final" },
    { chave: "(A) FIM PARA A ENTREGA FINAL",                    tipo: "range_data",   secao: "entrega_final" },
    { chave: "(P) INÍCIO PARA A CORREÇÃO DA ENTREGA FINAL",     tipo: "range_data",   secao: "entrega_final" },
    { chave: "(P) FIM PARA A CORREÇÃO DA ENTREGA FINAL",        tipo: "range_data",   secao: "entrega_final" },
  ],
  prova_substitutiva: [
    { chave: "ANO",                                     tipo: "range_numero", secao: "identificacao" },
    { chave: "OFERTA",                                  tipo: "multi_select", secao: "identificacao" },
    { chave: "DATA INÍCIO DO PROJETO",                  tipo: "range_data",   secao: "prova" },
    { chave: "INÍCIO PARAMETRIZAÇÃO DE PROVA",          tipo: "range_data",   secao: "prova" },
    { chave: "TÉRMINO PARAMETRIZAÇÃO DE PROVA",         tipo: "range_data",   secao: "prova" },
    { chave: "INFORMAR VIA PROTOCOLO LIBERAÇÃO DA PROVA", tipo: "range_data", secao: "prova" },
    { chave: "ABERTURA DO SERVIÇO",                     tipo: "range_data",   secao: "prova" },
    { chave: "INÍCIO DA PROVA ",                        tipo: "range_data",   secao: "prova" },
    { chave: "TÉRMINO DA PROVA",                        tipo: "range_data",   secao: "prova" },
    { chave: "FECHAMENTO DO SERVIÇO",                   tipo: "range_data",   secao: "prova" },
    { chave: "ENCERRAMENTO DOS PROTOCOLOS",             tipo: "range_data",   secao: "prova" },
    { chave: "ANÁLISE DOS PROTOCOS APTOS",              tipo: "range_data",   secao: "prova" },
    { chave: "CANCELAMENTO DOS PROTOCOLOS INAPTOS",     tipo: "range_data",   secao: "prova" },
    { chave: "LEVANTAMENTO DAS NOTAS",                  tipo: "range_data",   secao: "prova" },
    { chave: "LIBERAÇÃO DE NOTAS PELO PROFESSOR",       tipo: "range_data",   secao: "prova" },
    { chave: "ENVIO DE NOTAS",                          tipo: "range_data",   secao: "prova" },
  ],
  fechamento: [
    { chave: "ANO",                                    tipo: "range_numero", secao: "identificacao" },
    { chave: "OFERTA",                                 tipo: "multi_select", secao: "identificacao" },
    { chave: "DATA INÍCIO DO PROJETO DE APLICAÇÃO",    tipo: "range_data",   secao: "fechamento" },
    { chave: "DATA FINAL DO PROJETO DE APLICAÇÃO",     tipo: "range_data",   secao: "fechamento" },
    { chave: "ENCERRAMENTO DOS PROTOCOLOS",            tipo: "range_data",   secao: "fechamento" },
    { chave: "ENVIO DA RELAÇÃO DE TURMAS P/ RA",       tipo: "range_data",   secao: "fechamento" },
    { chave: "FECHAMENTO DAS TURMAS ",                 tipo: "range_data",   secao: "fechamento" },
    { chave: "BASE PRONTA",                            tipo: "range_data",   secao: "fechamento" },
    { chave: "QUANTIDADE",                             tipo: "range_numero", secao: "fechamento" },
    { chave: "Nº CHAMADO - FRESHDESK",                 tipo: "texto",        secao: "fechamento" },
    { chave: "DATA DE INSERÇÃO",                       tipo: "range_data",   secao: "fechamento" },
    { chave: "OBSERVAÇÕES",                            tipo: "texto",        secao: "fechamento" },
  ],
};

/**
 * Retorna as opções distintas de uma coluna, extraídas do dataset.
 * Usado pra popular multi_select em runtime (não há lista mestre).
 * Descarta null/undefined/"" e ordena alfabeticamente.
 */
export function extrairOpcoes(
  linhas: Array<{ dados: Record<string, unknown> }>,
  chave: string,
): string[] {
  const set = new Set<string>();
  for (const l of linhas) {
    const v = l.dados?.[chave];
    if (v == null) continue;
    const s = String(v).trim();
    if (s === "") continue;
    set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Aplica todos os filtros ativos em uma lista de linhas.
 *
 * - Filtros que não estão preenchidos são ignorados.
 * - AND entre filtros diferentes: cada filtro ativo precisa bater.
 * - Filtros cuja chave não existe na aba atual (usuário trocou de aba
 *   depois de filtrar) ficam inertes — não removem linhas.
 */
export function aplicarFiltros(
  linhas: Array<{ dados: Record<string, unknown> }>,
  filtros: FiltrosEstado,
  defs: DefFiltro[],
): typeof linhas {
  const chavesConhecidas = new Set(defs.map((d) => d.chave));

  const textosAtivos = Object.entries(filtros.textos).filter(
    ([k, v]) => v.trim() !== "" && chavesConhecidas.has(k),
  );
  const multisAtivos = Object.entries(filtros.multis).filter(
    ([k, v]) => v.length > 0 && chavesConhecidas.has(k),
  );
  const numerosAtivos = Object.entries(filtros.numeros).filter(
    ([k, v]) => (v.de != null || v.ate != null) && chavesConhecidas.has(k),
  );
  const datasAtivas = Object.entries(filtros.datas).filter(
    ([k, v]) => (v.de || v.ate) && chavesConhecidas.has(k),
  );

  if (
    textosAtivos.length === 0 &&
    multisAtivos.length === 0 &&
    numerosAtivos.length === 0 &&
    datasAtivas.length === 0
  ) {
    return linhas;
  }

  return linhas.filter((linha) => {
    const d = linha.dados ?? {};

    for (const [chave, valor] of textosAtivos) {
      const raw = d[chave];
      if (raw == null) return false;
      if (!String(raw).toLowerCase().includes(valor.trim().toLowerCase())) return false;
    }

    for (const [chave, opcoes] of multisAtivos) {
      const raw = d[chave];
      if (raw == null) return false;
      if (!opcoes.includes(String(raw))) return false;
    }

    for (const [chave, { de, ate }] of numerosAtivos) {
      const raw = d[chave];
      if (raw == null) return false;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isNaN(n)) return false;
      if (de != null && n < de) return false;
      if (ate != null && n > ate) return false;
    }

    for (const [chave, { de, ate }] of datasAtivas) {
      const raw = d[chave];
      if (raw == null) return false;
      // Datas vêm em ISO (yyyy-mm-dd). Comparação lexicográfica funciona.
      const iso = String(raw).slice(0, 10);
      if (de && iso < de) return false;
      if (ate && iso > ate) return false;
    }

    return true;
  });
}

/**
 * Conta quantos filtros distintos estão ativos (pra badge do botão).
 * Cada chave conta 1 vez, independentemente de quantos valores
 * carregue (multi-select com 3 escolas = 1 filtro).
 */
export function contarFiltrosAtivos(filtros: FiltrosEstado): number {
  const t = Object.values(filtros.textos).filter((v) => v.trim() !== "").length;
  const m = Object.values(filtros.multis).filter((v) => v.length > 0).length;
  const n = Object.values(filtros.numeros).filter((v) => v.de != null || v.ate != null).length;
  const d = Object.values(filtros.datas).filter((v) => v.de || v.ate).length;
  return t + m + n + d;
}

/**
 * Serializa o estado de filtros para uma string curta (base64 de
 * JSON URL-encoded) que cabe num query param sem quebrar chaves com
 * espaço/acento. Retorna undefined quando não há filtro ativo — assim
 * a URL fica limpa (`/calendario` em vez de `?f=eyJ0…`).
 */
export function encodeFiltros(filtros: FiltrosEstado): string | undefined {
  if (contarFiltrosAtivos(filtros) === 0) return undefined;
  try {
    return btoa(encodeURIComponent(JSON.stringify(filtros)));
  } catch {
    return undefined;
  }
}

/**
 * Reidrata o estado de filtros a partir do query param. Sanity check
 * de forma — se o payload for lixo (usuário editou a URL na mão), volta
 * pra estado vazio.
 */
export function decodeFiltros(encoded: string | undefined): FiltrosEstado {
  const vazio = filtrosVazios();
  if (!encoded) return vazio;
  try {
    const parsed = JSON.parse(decodeURIComponent(atob(encoded))) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "textos" in parsed &&
      "multis" in parsed &&
      "numeros" in parsed &&
      "datas" in parsed
    ) {
      const p = parsed as FiltrosEstado;
      return {
        textos: typeof p.textos === "object" && p.textos ? p.textos : {},
        multis: typeof p.multis === "object" && p.multis ? p.multis : {},
        numeros: typeof p.numeros === "object" && p.numeros ? p.numeros : {},
        datas: typeof p.datas === "object" && p.datas ? p.datas : {},
      };
    }
  } catch {
    // Cai no vazio.
  }
  return vazio;
}
