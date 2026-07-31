/**
 * Motor de regras do calendário acadêmico 411 PUC RIO COLLAB.
 *
 * Porta fiel de `sistema_calendario/regras.py` (Python) para TypeScript.
 * Reproduz as fórmulas documentadas em "Documentação - 411 PUC RIO COLLAB.docx":
 *   - Fechamento de turmas: seção 12.
 *   - Prova Substitutiva: seção 11.
 *
 * IMPORTANTE — âncora de virada de ano: a data de início da 1ª oferta de
 * cada ano NÃO é derivável por fórmula (é decisão institucional — ver
 * docx seção 12.3). Por isso é sempre um INPUT explícito (parâmetro
 * `anchor`), nunca calculado aqui.
 *
 * CONFLITOS DE FERIADO: nenhuma célula é corrigida automaticamente. Só
 * sinalizamos (campo `conflitos`) — a decisão de antecipar/postergar é
 * sempre editorial (docx seção 8.3).
 */
import { type ISODate, addDays, workday, HolidayCalendar } from "./feriados.ts";

// CursoMaster tinha uma dependencia externa em cursosMaster.ts. Como a fonte
// da verdade agora e o banco (tabelas cursos + disciplinas), inline aqui.
export interface DisciplinaCarrossel {
  ordem: number;
  disciplina: string | null;
  codigoDisciplina: string | null;
  tipoOferta: string | null;
  ch: number | null;
  liveEstudoCasoOffset: number | null;
  liveFechamentoOffset: number | null;
}
export interface CursoMaster {
  sigla: string;
  curso: string;
  diaSemanaDefault: "quinta" | "quarta";
  paCh: number;
  paAnosElegiveis: number[];
  paCodigoPrefixo: string;
  carrossel: DisciplinaCarrossel[];
}

const CAL = new HolidayCalendar();

export const N_OFERTAS_POR_ANO = 15;
export const INTERVALO_DIAS = 21;
export const N_ENTRADAS_POR_ANO = 16;

export interface LinhaFechamentoTurmas {
  ano: number;
  oferta: number;
  B: ISODate; // DATA INÍCIO DO PROJETO DE APLICAÇÃO
  C: ISODate; // DATA FINAL DO PROJETO DE APLICAÇÃO
  D: ISODate; // ENCERRAMENTO DOS PROTOCOLOS
  E: ISODate; // ENVIO DA RELAÇÃO DE TURMAS P/ RA
  G: ISODate; // FECHAMENTO DAS TURMAS
  H: ISODate; // BASE PRONTA
  conflitos: Record<string, string>;
}

/**
 * Gera as `nOfertas` linhas de um ano da aba Fechamento de turmas.
 *
 * Fórmulas (docx seção 12.2):
 *   B(oferta N) = B(oferta N-1) + 21 dias corridos
 *   C = B + diasC   (42 a partir de 2027; era 30 em 2026)
 *   D = B + diasD   (74 a partir de 2027)
 *   E = WORKDAY(C, 12)
 *   G = WORKDAY(E, 8)
 *   H = WORKDAY(G, 5)
 *
 * Nenhum ajuste de recesso de fim de ano é aplicado automaticamente na
 * última oferta (docx seção 12.3) — fica sinalizado em `conflitos._recesso`
 * quando D ou H da última oferta caírem no ano seguinte.
 */
export function gerarFechamentoTurmas(
  ano: number,
  anchorB1: ISODate,
  nOfertas: number = N_OFERTAS_POR_ANO,
  diasC = 42,
  diasD = 74,
): LinhaFechamentoTurmas[] {
  const linhas: LinhaFechamentoTurmas[] = [];
  for (let i = 0; i < nOfertas; i++) {
    const oferta = i + 1;
    const B = addDays(anchorB1, INTERVALO_DIAS * i);
    const C = addDays(B, diasC);
    const D = addDays(B, diasD);
    const E = workday(C, 12);
    const G = workday(E, 8);
    const H = workday(G, 5);

    const conflitos: Record<string, string> = {};
    for (const [col, val] of [["B", B], ["C", C], ["D", D], ["E", E], ["G", G], ["H", H]] as const) {
      const nome = CAL.nameIfHoliday(val);
      if (nome) conflitos[col] = nome;
    }
    if (oferta === nOfertas && (Number(D.slice(0, 4)) > ano || Number(H.slice(0, 4)) > ano)) {
      conflitos["_recesso"] =
        "D e/ou H caem em janeiro do ano seguinte — mesma janela de recesso que historicamente " +
        "recebeu ajuste manual (docx seção 12.3). Avaliar necessidade de ajuste editorial antes do uso operacional.";
    }

    linhas.push({ ano, oferta, B, C, D, E, G, H, conflitos });
  }
  return linhas;
}

export interface LinhaProvaSubstitutiva {
  ano: number;
  oferta: number;
  C: ISODate;
  D: ISODate;
  E: ISODate;
  F: ISODate;
  G: ISODate;
  H: ISODate;
  I: ISODate;
  J: ISODate;
  K: ISODate;
  L: ISODate; // INÍCIO DA PROVA — define o ANO da linha
  M: ISODate;
  N: ISODate;
  O: ISODate;
  P: ISODate;
  conflitos: Record<string, string>;
}

function linhaProvaSubstitutiva(C: ISODate): Omit<LinhaProvaSubstitutiva, "ano" | "oferta" | "conflitos"> {
  const D = addDays(C, 52);
  const E = D;
  const F = workday(E, 5);
  const G = workday(F, 1);
  const H = workday(G, 1);
  const I = G;
  const J = workday(I, 2);
  const K = J;
  const L = addDays(K, 1);
  const M = addDays(L, 5);
  const N = workday(M, 1);
  const O = workday(N, 1);
  const P = workday(O, 2);
  return { C, D, E, F, G, H, I, J, K, L, M, N, O, P };
}

/**
 * Gera as linhas da aba Prova Substitutiva cujo INÍCIO DA PROVA (L) cai no
 * ano `anoAlvo`, começando em `anchorCPrimeiraOferta` (a DATA INÍCIO DO
 * PROJETO da primeira oferta dessa leva — normalmente a mesma âncora usada
 * em Fechamento de turmas / Projeto de Aplicação para o mesmo ano, ver docx
 * seção 11.1 e seção 12.3 sobre reancoragem).
 *
 * ATENÇÃO: ver docx seção 12.6 — a projeção 2028 gravada manualmente em
 * 2026-07-22 (ofertas 16-32) NÃO usou essa reancoragem. Este gerador
 * implementa a regra CORRETA; não usar para sobrescrever o arquivo
 * existente sem revisar esse ponto com o responsável pelo arquivo.
 */
export function gerarProvaSubstitutiva(
  anoAlvo: number,
  primeiraOfertaDoAno: number,
  anchorCPrimeiraOferta: ISODate,
): LinhaProvaSubstitutiva[] {
  const linhas: LinhaProvaSubstitutiva[] = [];
  let C = anchorCPrimeiraOferta;
  let oferta = primeiraOfertaDoAno;
  while (true) {
    const vals = linhaProvaSubstitutiva(C);
    const anoLinha = Number(vals.L.slice(0, 4));
    if (anoLinha > anoAlvo) break;

    if (anoLinha === anoAlvo) {
      const conflitos: Record<string, string> = {};
      for (const [col, val] of Object.entries(vals)) {
        if (col === "C") continue;
        const nome = CAL.nameIfHoliday(val as ISODate);
        if (nome) conflitos[col] = nome;
      }
      linhas.push({ ano: anoLinha, oferta, conflitos, ...vals });
    }
    C = addDays(C, INTERVALO_DIAS);
    oferta += 1;
  }
  return linhas;
}

// ---------------------------------------------------------------------------
// Disciplinas (docx seções 2-6)
// ---------------------------------------------------------------------------

const ESCOLA_IA = new Set(["RH", "IL", "IK", "CE"]);

export interface LinhaDisciplina {
  ano: number;
  entrada: string; // "E1".."E16"
  codCurso: string;
  sigla: string;
  curso: string;
  escola: string;
  ordem: number;
  disciplina: string | null;
  codigoDisciplina: string | null;
  codigoTurma: string | null; // preenchido depois por atribuirSufixosTurma
  tipoOferta: string | null;
  ch: number | null;
  diaSemanaLive: string | null;
  inicioCaptacao: ISODate;
  terminoCaptacao: ISODate;
  dataInicio: ISODate;
  dataFim: ISODate;
  liveEstudoCaso: ISODate | null;
  liveFechamento: ISODate | null;
  questionario: ISODate;
  conflitos: Record<string, string>;
}

/**
 * Gera as `nEntradas` linhas (padrão 16 = E1..E16, docx seção 10) de um ano
 * da aba Disciplinas para um curso. Porta fiel de `regras.py::gerar_disciplinas`
 * — ver lá o detalhe de cada fórmula e das âncoras institucionais explícitas
 * (`dataInicioE1`, `captacaoInicioE1`).
 *
 * `terminoCaptacaoE1`: a TÉRMINO CAPTAÇÃO da entrada 1 NÃO segue a fórmula
 * padrão (+20 dias) — os únicos exemplos reais conferidos mostram uma janela
 * bem maior (98 a 112 dias). Se omitido, cai para o valor "natural"
 * (provavelmente errado) e sinaliza `conflitos._captacao_e1_estimada`.
 */
export function gerarDisciplinas(
  codCurso: string,
  cursoInfo: CursoMaster,
  anoAlvo: number,
  dataInicioE1: ISODate,
  captacaoInicioE1: ISODate,
  ordemInicial: number,
  nEntradas: number = N_ENTRADAS_POR_ANO,
  terminoCaptacaoE1?: ISODate,
): LinhaDisciplina[] {
  const carrossel = new Map(cursoInfo.carrossel.map((d) => [d.ordem, d]));
  const tamanhoCarrossel = carrossel.size;
  const escola = ESCOLA_IA.has(cursoInfo.sigla) ? "IA" : "-";
  const diaSemanaLabel = cursoInfo.diaSemanaDefault === "quinta" ? "QUINTA-FEIRA" : "QUARTA-FEIRA";

  const linhas: LinhaDisciplina[] = [];
  for (let i = 0; i < nEntradas; i++) {
    const entradaNum = i + 1;
    const dataInicio = addDays(dataInicioE1, INTERVALO_DIAS * i);
    const dataFim = addDays(dataInicio, 30);
    const inicioCaptacao = addDays(captacaoInicioE1, INTERVALO_DIAS * i);
    const questionario = dataFim;

    const conflitos: Record<string, string> = {};
    let terminoCaptacao: ISODate;
    if (i === 0) {
      if (terminoCaptacaoE1) {
        terminoCaptacao = terminoCaptacaoE1;
      } else {
        terminoCaptacao = addDays(inicioCaptacao, 20);
        conflitos["_captacao_e1_estimada"] =
          "TÉRMINO CAPTAÇÃO da entrada 1 calculado com a fórmula padrão (+20 dias), mas os únicos " +
          "exemplos reais conferidos mostram uma janela bem maior (98 a 112 dias) para a entrada 1 " +
          "do ano. Confirmar o valor real com quem mantém o arquivo antes de aplicar.";
      }
    } else {
      terminoCaptacao = addDays(inicioCaptacao, 20);
    }

    const ordem = ((ordemInicial - 1 + i) % tamanhoCarrossel) + 1;
    const disc = carrossel.get(ordem)!;
    const disciplina = disc.disciplina;

    if (!disciplina) {
      conflitos["_lacuna_carrossel"] =
        `ORDEM ${ordem} do carrossel de ${codCurso} é uma lacuna conhecida em cursosMaster.ts ` +
        "(dado nunca preenchido na planilha original). Preencher disciplina/código/tipo/CH " +
        "manualmente antes de aplicar esta linha.";
      linhas.push({
        ano: anoAlvo, entrada: `E${entradaNum}`, codCurso, sigla: cursoInfo.sigla, curso: cursoInfo.curso,
        escola, ordem, disciplina: null, codigoDisciplina: null, codigoTurma: null,
        tipoOferta: null, ch: null, diaSemanaLive: diaSemanaLabel,
        inicioCaptacao, terminoCaptacao, dataInicio, dataFim,
        liveEstudoCaso: null, liveFechamento: null, questionario, conflitos,
      });
      continue;
    }

    const liveQ = disc.liveEstudoCasoOffset != null ? addDays(dataInicio, disc.liveEstudoCasoOffset) : null;
    const liveR = disc.liveFechamentoOffset != null ? addDays(dataInicio, disc.liveFechamentoOffset) : null;

    for (const [col, val] of [["Q", liveQ], ["R", liveR]] as const) {
      if (!val) continue;
      const nome = CAL.nameIfHoliday(val);
      if (nome) conflitos[col] = nome;
    }

    linhas.push({
      ano: anoAlvo, entrada: `E${entradaNum}`, codCurso, sigla: cursoInfo.sigla, curso: cursoInfo.curso,
      escola, ordem, disciplina,
      codigoDisciplina: disc.codigoDisciplina, codigoTurma: null,
      tipoOferta: disc.tipoOferta, ch: disc.ch, diaSemanaLive: diaSemanaLabel,
      inicioCaptacao, terminoCaptacao, dataInicio, dataFim,
      liveEstudoCaso: liveQ, liveFechamento: liveR, questionario, conflitos,
    });
  }
  return linhas;
}

/**
 * Atribui `codigoTurma` a um LOTE de linhas de Disciplinas geradas para
 * vários cursos do mesmo ano (docx seção 5). Porta fiel de
 * `regras.py::atribuir_sufixos_turma` — ver lá a explicação do agrupamento
 * por LIVE calculada (não por curso) e a ordenação cronológica do sufixo.
 * Muta `linhas` in-place.
 */
export function atribuirSufixosTurma(linhas: LinhaDisciplina[]): void {
  const grupos = new Map<string, LinhaDisciplina[]>();
  for (const l of linhas) {
    if (!l.codigoDisciplina) continue;
    const chave = `${l.ano}|${l.codigoDisciplina}|${l.liveEstudoCaso ?? ""}|${l.liveFechamento ?? ""}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(l);
  }

  const porDisciplinaAno = new Map<string, { liveQ: ISODate | null; grupo: LinhaDisciplina[] }[]>();
  for (const grupo of grupos.values()) {
    const l0 = grupo[0];
    const chaveDA = `${l0.ano}|${l0.codigoDisciplina}`;
    if (!porDisciplinaAno.has(chaveDA)) porDisciplinaAno.set(chaveDA, []);
    porDisciplinaAno.get(chaveDA)!.push({ liveQ: l0.liveEstudoCaso, grupo });
  }

  for (const [chaveDA, entradas] of porDisciplinaAno) {
    entradas.sort((a, b) => {
      if (a.liveQ === b.liveQ) return 0;
      if (a.liveQ === null) return 1;
      if (b.liveQ === null) return -1;
      return a.liveQ < b.liveQ ? -1 : 1;
    });
    const [ano, cod] = chaveDA.split("|");
    entradas.forEach((entrada, idx) => {
      const sufixo = String(idx + 1).padStart(2, "0");
      for (const l of entrada.grupo) {
        l.codigoTurma = `${cod}_${ano}0_${sufixo}`;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Projeto de Aplicação (docx seção 9)
// ---------------------------------------------------------------------------

export interface LinhaProjetoAplicacao {
  ano: number;
  oferta: number; // reinicia em 1 a cada ano (docx seção 9.1, coluna B)
  codCurso: string;
  sigla: string;
  curso: string;
  ch: number;
  codigoTurma: string;
  diaSemana: string;
  H: ISODate; // DATA INÍCIO — âncora
  I: ISODate; // DATA FIM
  J: ISODate | null; // DATA LIMITE DE ENTURMAÇÃO — NÃO é fórmula real, ver docstring
  L: ISODate;
  M: ISODate;
  N: ISODate;
  O: ISODate;
  P: ISODate;
  Q: ISODate;
  R: ISODate;
  S: ISODate;
  T: ISODate;
  U: ISODate;
  conflitos: Record<string, string>;
}

/**
 * Gera as `nOfertas` linhas (padrão 15, docx seção 9.4) de um ano da aba
 * Projeto de Aplicação para um curso. Porta fiel de
 * `regras.py::gerar_projeto_aplicacao` — ver lá o detalhe de cada fórmula.
 *
 * `anchorH1` é a MESMA âncora institucional usada em `gerarFechamentoTurmas`
 * para o mesmo ano (docx seção 9.3). Coluna J não é calculada (fica `null`)
 * — não é fórmula do arquivo original (docx seção 9.6).
 */
export function gerarProjetoAplicacao(
  codCurso: string,
  cursoInfo: CursoMaster,
  anoAlvo: number,
  anchorH1: ISODate,
  nOfertas: number = N_OFERTAS_POR_ANO,
  diasI = 42,
): LinhaProjetoAplicacao[] {
  const linhas: LinhaProjetoAplicacao[] = [];
  for (let i = 0; i < nOfertas; i++) {
    const oferta = i + 1;
    const H = addDays(anchorH1, INTERVALO_DIAS * i);
    const I = addDays(H, diasI);
    const L = addDays(H, 3);
    const M = addDays(H, 31);
    const N = H;
    const O = addDays(N, 14);
    const P = N;
    const Q = addDays(O, 7);
    const R = Q;
    const S = addDays(R, 21);
    const T = R;
    const U = addDays(S, 10);

    const conflitos: Record<string, string> = {
      _enturmacao:
        "DATA LIMITE DE ENTURMAÇÃO (J) não é fórmula do arquivo original (docx seção 9.6) — precisa " +
        "ser informada/validada pelo Registro Acadêmico antes de aplicar esta linha.",
    };
    for (const [col, val] of [["H", H], ["I", I], ["L", L], ["M", M], ["O", O], ["Q", Q], ["S", S], ["U", U]] as const) {
      const nome = CAL.nameIfHoliday(val);
      if (nome) conflitos[col] = nome;
    }

    const codigoTurma = `${cursoInfo.paCodigoPrefixo}_${anoAlvo}0_${String(oferta).padStart(2, "0")}`;

    linhas.push({
      ano: anoAlvo, oferta, codCurso, sigla: cursoInfo.sigla, curso: cursoInfo.curso,
      ch: cursoInfo.paCh, codigoTurma, diaSemana: cursoInfo.diaSemanaDefault,
      H, I, J: null, L, M, N, O, P, Q, R, S, T, U, conflitos,
    });
  }
  return linhas;
}
