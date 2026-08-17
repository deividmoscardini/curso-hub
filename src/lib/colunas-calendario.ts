// Fase 11 (fix) — Ordem canônica das colunas por aba, seguindo o Excel
// original `411 - PUC RIO COLLAB - Atualizado.xlsx`.
//
// Motivo: Postgres `jsonb` reordena as chaves ao gravar (por tamanho +
// ordem alfabética interna). Isso significa que `Object.keys(dados)`
// NÃO retorna a ordem original do Excel. A tela mostrava colunas
// embaralhadas. Solução: hard-coding da ordem por aba.
//
// Chaves EXATAMENTE como o import da planilha grava — inclui:
// - "DATA  INÍCIO" com DOIS espaços
// - "DATA FIM ", "CÓDIGO DA TURMA ", "LIVE 2 " com trailing space
// - "INÍCIO DA PROVA " com trailing space
// - "FECHAMENTO DAS TURMAS " com trailing space
//
// Se novas colunas surgirem (import de outro tenant com estrutura
// diferente), elas caem no bloco "extras" no fim da tabela.

export type AbaCalendario =
  | "disciplinas"
  | "projeto_aplicacao"
  | "prova_substitutiva"
  | "fechamento";

export const COLUNAS_POR_ABA: Record<AbaCalendario, readonly string[]> = {
  disciplinas: [
    "ANO",
    "ENTRADA CAPTAÇÃO",
    "INÍCIO CAPTAÇÃO",
    "TÉRMINO CAPTAÇÃO",
    "ESCOLA",
    "SIGLA",
    "CÓD CURSO",
    "CURSO",
    "ORDEM DA DISCIPLINA",
    "DISCIPLINA",
    "CÓDIGO DA TURMA ",
    "TIPO DE OFERTA",
    "CH",
    "DATA  INÍCIO",
    "DATA FIM ",
    "DIA DA SEMANA DA LIVE",
    "LIVE ESTUDO DE CASO (SEMANA 2)",
    "LIVE DE FECHAMENTO (SEMANA 3)",
    "QUESTIONÁRIO (SEMANA 4)",
  ],
  projeto_aplicacao: [
    "ANO",
    "OFERTA",
    "SIGLA",
    "CÓD. DO CURSO",
    "CURSO",
    "CH",
    "TURMA",
    "DATA INÍCIO",
    "DATA FIM ",
    "DIA DA SEMANA",
    "LIVE 1",
    "LIVE 2 ",
    "(A) INÍCIO PARA A ENTREGA DO FEEDBACK",
    "(A) FIM PARA A ENTREGA DO FEEDBACK",
    "(P) INÍCIO PARA A CORREÇÃO DO FEEDBACK",
    "(P) FIM PARA A CORREÇÃO DO FEEDBACK",
    "(A) INÍCIO PARA A ENTREGA  FINAL",
    "(A) FIM PARA A ENTREGA FINAL",
    "(P) INÍCIO PARA A CORREÇÃO DA ENTREGA FINAL",
    "(P) FIM PARA A CORREÇÃO DA ENTREGA FINAL",
  ],
  prova_substitutiva: [
    "ANO",
    "OFERTA",
    "DATA INÍCIO DO PROJETO",
    "INÍCIO PARAMETRIZAÇÃO DE PROVA",
    "TÉRMINO PARAMETRIZAÇÃO DE PROVA",
    "INFORMAR VIA PROTOCOLO LIBERAÇÃO DA PROVA",
    "ABERTURA DO SERVIÇO",
    "INÍCIO DA PROVA ",
    "TÉRMINO DA PROVA",
    "FECHAMENTO DO SERVIÇO",
    "ENCERRAMENTO DOS PROTOCOLOS",
    "ANÁLISE DOS PROTOCOS APTOS",
    "CANCELAMENTO DOS PROTOCOLOS INAPTOS",
    "LEVANTAMENTO DAS NOTAS",
    "LIBERAÇÃO DE NOTAS PELO PROFESSOR",
    "ENVIO DE NOTAS",
  ],
  fechamento: [
    "ANO",
    "OFERTA",
    "DATA INÍCIO DO PROJETO DE APLICAÇÃO",
    "DATA FINAL DO PROJETO DE APLICAÇÃO",
    "ENCERRAMENTO DOS PROTOCOLOS",
    "ENVIO DA RELAÇÃO DE TURMAS P/ RA",
    "FECHAMENTO DAS TURMAS ",
    "BASE PRONTA",
    "QUANTIDADE",
    "Nº CHAMADO - FRESHDESK",
    "DATA DE INSERÇÃO",
    "OBSERVAÇÕES",
  ],
} as const;

/**
 * Retorna a lista final de colunas pra renderizar. Segue estritamente a
 * ordem canônica quando ela existe (não mistura com extras) — a ordem
 * é a que o time confirmou como oficial. Se um dia não houver ordem
 * canônica pra alguma aba, cai no comportamento "todas as chaves das
 * linhas" pra não sumir com dados.
 */
export function colunasParaExibir(
  aba: AbaCalendario,
  linhas: Array<{ dados: Record<string, unknown> }>,
): string[] {
  const canonicas = COLUNAS_POR_ABA[aba];
  if (canonicas && canonicas.length > 0) return [...canonicas];
  const vistas = new Set<string>();
  const extras: string[] = [];
  for (const linha of linhas) {
    for (const chave of Object.keys(linha.dados ?? {})) {
      if (!vistas.has(chave)) { vistas.add(chave); extras.push(chave); }
    }
  }
  return extras;
}

/**
 * Label amigável pra exibir no header da tabela. Remove trailing
 * whitespace e colapsa espaços internos duplicados — o Excel original
 * gerou headers com esses quirks e o import preservou. Aqui a gente
 * mostra o texto "limpo" mas a chave interna continua sendo a original
 * (essa função é só cosmética; leitura de `dados[chave]` continua
 * usando a chave exata).
 */
export function labelColuna(chave: string): string {
  return chave.replace(/\s+/g, " ").trim();
}
