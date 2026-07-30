/**
 * Testes de regressão — espelham `sistema_calendario/tests/test_regras.py`
 * (Python), mesmos valores já conferidos manualmente contra o arquivo real
 * e o LibreOffice em 2026-07-22. Rodar com `deno test` no Supabase, ou
 * localmente com `node --experimental-strip-types regras.test.ts` (usa
 * apenas `assert` simples, sem framework, para não depender de instalação).
 */
import {
  gerarFechamentoTurmas,
  gerarProvaSubstitutiva,
  gerarDisciplinas,
  atribuirSufixosTurma,
  gerarProjetoAplicacao,
  type LinhaDisciplina,
} from "./regras.ts";
import { CURSOS_MASTER } from "./cursosMaster.ts";

let falhas = 0;
function assertEq(atual: unknown, esperado: unknown, msg: string) {
  const a = JSON.stringify(atual);
  const e = JSON.stringify(esperado);
  if (a !== e) {
    falhas++;
    console.error(`FALHOU: ${msg}\n  esperado: ${e}\n  atual:    ${a}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

// --- test_fechamento_turmas_2027_bate_com_arquivo_real ---
{
  const linhas = gerarFechamentoTurmas(2027, "2027-01-04");
  assertEq(linhas.length, 15, "2027: 15 linhas");
  const l1 = linhas[0];
  assertEq(l1.B, "2027-01-04", "2027 oferta1 B");
  assertEq(l1.C, "2027-02-15", "2027 oferta1 C");
  assertEq(l1.D, "2027-03-19", "2027 oferta1 D");
  assertEq(l1.E, "2027-03-03", "2027 oferta1 E");
  assertEq(l1.G, "2027-03-15", "2027 oferta1 G");
  assertEq(l1.H, "2027-03-22", "2027 oferta1 H");

  const l15 = linhas[14];
  assertEq(l15.B, "2027-10-25", "2027 oferta15 B");
  assertEq(l15.C, "2027-12-06", "2027 oferta15 C");
  assertEq(l15.D, "2028-01-07", "2027 oferta15 D (natural, sem ajuste manual)");
  assertEq(l15.E, "2027-12-22", "2027 oferta15 E");
  assertEq(l15.G, "2028-01-03", "2027 oferta15 G");
  assertEq(l15.H, "2028-01-10", "2027 oferta15 H (natural, sem ajuste manual)");
  assertEq("_recesso" in l15.conflitos, true, "2027 oferta15 sinaliza recesso");
}

// --- test_fechamento_turmas_2028_bate_com_projecao_ja_gravada ---
{
  const linhas = gerarFechamentoTurmas(2028, "2028-01-03");
  assertEq(linhas.length, 15, "2028: 15 linhas");
  const l1 = linhas[0];
  assertEq([l1.B, l1.C, l1.D, l1.E, l1.G, l1.H],
    ["2028-01-03", "2028-02-14", "2028-03-17", "2028-03-01", "2028-03-13", "2028-03-20"],
    "2028 oferta1");
  const l15 = linhas[14];
  assertEq([l15.B, l15.C, l15.D, l15.E, l15.G, l15.H],
    ["2028-10-23", "2028-12-04", "2029-01-05", "2028-12-20", "2029-01-01", "2029-01-08"],
    "2028 oferta15");
  assertEq(linhas[2].conflitos["H"], "Dia do Trabalho", "2028 oferta3 conflito H");
  assertEq(linhas[12].conflitos["G"], "Dia da Consciência Negra", "2028 oferta13 conflito G");
  assertEq(linhas[14].conflitos["G"], "Confraternização Universal", "2028 oferta15 conflito G");
}

// --- test_prova_substitutiva_2027_bate_com_arquivo_real ---
{
  const linhas = gerarProvaSubstitutiva(2027, 1, "2027-01-04");
  const l1 = linhas[0];
  assertEq(l1.C, "2027-01-04", "PS 2027 oferta1 C");
  assertEq(l1.D, "2027-02-25", "PS 2027 oferta1 D");
  assertEq(l1.P, "2027-03-19", "PS 2027 oferta1 P");
}

// --- test_prova_substitutiva_oferta15_sem_ajuste_manual_de_recesso ---
{
  const linhas = gerarProvaSubstitutiva(2027, 15, "2027-10-25");
  const l = linhas[0];
  assertEq(l.C, "2027-10-25", "PS oferta15 C");
  assertEq(l.E, "2027-12-16", "PS oferta15 E (natural, sem ajuste manual)");
  assertEq(l.L, "2027-12-29", "PS oferta15 L (cai em 2027, não 2028, sem o ajuste manual)");
}

// --- test_gerar_disciplinas_ub_ordem1_bate_com_arquivo_real ---
{
  const curso = CURSOS_MASTER["411-722"];
  const linhas = gerarDisciplinas(
    "411-722", curso, 2026, "2026-04-20", "2026-01-19", 1, 1, "2026-04-27",
  );
  const l = linhas[0];
  assertEq(l.disciplina, "Arquitetura Da Natureza", "UB ordem1 disciplina");
  assertEq(l.dataInicio, "2026-04-20", "UB ordem1 dataInicio");
  assertEq(l.liveEstudoCaso, "2026-04-30", "UB ordem1 liveEstudoCaso (+10)");
  assertEq(l.liveFechamento, "2026-05-07", "UB ordem1 liveFechamento (+17)");
  assertEq(l.inicioCaptacao, "2026-01-19", "UB ordem1 inicioCaptacao");
  assertEq(l.terminoCaptacao, "2026-04-27", "UB ordem1 terminoCaptacao (informado)");
  assertEq("_captacao_e1_estimada" in l.conflitos, false, "UB ordem1 sem estimativa (foi informado)");
}

// --- test_gerar_disciplinas_capta_e1_sem_valor_informado_sinaliza_estimativa ---
{
  const curso = CURSOS_MASTER["411-722"];
  const linhas = gerarDisciplinas("411-722", curso, 2026, "2026-04-20", "2026-01-19", 1, 1);
  const l = linhas[0];
  assertEq(l.terminoCaptacao, "2026-02-08", "UB terminoCaptacao natural (+20, provavelmente errado)");
  assertEq("_captacao_e1_estimada" in l.conflitos, true, "UB sinaliza estimativa quando não informado");
}

// --- test_gerar_disciplinas_admiravel_sem_live_fechamento_e_lideranca_override ---
{
  const sm = CURSOS_MASTER["411-393"];
  const linhasSm = gerarDisciplinas("411-393", sm, 2026, "2026-01-26", "2025-10-13", 1, 1, "2026-02-02");
  assertEq(linhasSm[0].disciplina, "Admirável Futuro Novo", "SM ordem1 disciplina");
  assertEq(linhasSm[0].liveFechamento, null, "Admirável Futuro Novo nunca tem live de fechamento");

  const dg = CURSOS_MASTER["411-979"];
  const linhasDg = gerarDisciplinas("411-979", dg, 2027, "2027-05-10", "2027-01-01", 7, 1, "2027-01-20");
  const l = linhasDg[0];
  assertEq(l.disciplina, "Liderança Estratégica Aplicada", "DG ordem7 disciplina");
  assertEq(l.liveEstudoCaso, "2027-05-19", "DG Liderança liveEstudoCaso (+9, sem override)");
  assertEq(l.liveFechamento, "2027-05-28", "DG Liderança liveFechamento (+18, override, sexta-feira)");
}

// --- test_gerar_disciplinas_lacuna_conhecida_do_rh_nao_e_inventada ---
{
  const rh = CURSOS_MASTER["411-1020"];
  const linhas = gerarDisciplinas("411-1020", rh, 2029, "2029-01-01", "2028-09-01", 2, 1, "2028-12-01");
  const l = linhas[0];
  assertEq(l.disciplina, null, "RH ordem2: lacuna não inventada");
  assertEq(l.codigoDisciplina, null, "RH ordem2: sem código");
  assertEq(l.codigoTurma, null, "RH ordem2: sem turma");
  assertEq("_lacuna_carrossel" in l.conflitos, true, "RH ordem2 sinaliza lacuna de carrossel");
}

// --- test_atribuir_sufixos_turma_agrupa_por_live_calculada ---
{
  const linha = (codCurso: string, liveQ: string, liveR: string): LinhaDisciplina => ({
    ano: 2026, entrada: "E1", codCurso, sigla: codCurso, curso: codCurso,
    escola: "-", ordem: 1, disciplina: "Admirável Futuro Novo",
    codigoDisciplina: "41130010007", codigoTurma: null, tipoOferta: "C", ch: 20,
    diaSemanaLive: "QUINTA-FEIRA",
    inicioCaptacao: "2025-10-13", terminoCaptacao: "2026-02-02",
    dataInicio: "2026-02-03", dataFim: "2026-02-25",
    liveEstudoCaso: liveQ, liveFechamento: liveR, questionario: "2026-02-25",
    conflitos: {},
  });

  const linhas = [
    linha("GRUPO_TARDE_A", "2026-02-13", "2026-02-20"),
    linha("GRUPO_TARDE_B", "2026-02-13", "2026-02-20"),
    linha("GRUPO_CEDO", "2026-02-05", "2026-02-12"),
  ];
  atribuirSufixosTurma(linhas);
  const porCurso = Object.fromEntries(linhas.map((l) => [l.codCurso, l.codigoTurma]));
  assertEq(porCurso["GRUPO_CEDO"], "41130010007_20260_01", "grupo mais cedo -> sufixo 01");
  assertEq(porCurso["GRUPO_TARDE_A"], "41130010007_20260_02", "grupo tarde A -> sufixo 02");
  assertEq(porCurso["GRUPO_TARDE_B"], "41130010007_20260_02", "grupo tarde B -> mesmo sufixo do A");
}

// --- test_gerar_projeto_aplicacao_2026_bate_com_arquivo_real ---
{
  const sm = CURSOS_MASTER["411-393"];
  const linhas = gerarProjetoAplicacao("411-393", sm, 2026, "2026-01-26", 2, 30);
  const [l1, l2] = linhas;
  assertEq(l1.H, "2026-01-26", "PA SM oferta1 H");
  assertEq(l1.I, "2026-02-25", "PA SM oferta1 I (+30)");
  assertEq(l2.H, "2026-02-16", "PA SM oferta2 H (+21)");
  assertEq(l2.I, "2026-03-18", "PA SM oferta2 I");
  assertEq(l1.codigoTurma, "41130020001_20260_01", "PA SM oferta1 turma");
  assertEq(l2.codigoTurma, "41130020001_20260_02", "PA SM oferta2 turma");
}

// --- test_gerar_projeto_aplicacao_cascata_bloco_feedback ---
{
  const sm = CURSOS_MASTER["411-393"];
  const linhas = gerarProjetoAplicacao("411-393", sm, 2027, "2027-01-04", 1, 42);
  const l = linhas[0];
  assertEq(l.H, "2027-01-04", "PA 2027 H");
  assertEq(l.I, "2027-02-15", "PA 2027 I (+42)");
  assertEq(l.L, "2027-01-07", "PA 2027 L (+3)");
  assertEq(l.M, "2027-02-04", "PA 2027 M (+31)");
  assertEq(l.N, l.H, "PA 2027 N = H");
  assertEq(l.P, l.N, "PA 2027 P = N");
  assertEq(l.R, l.Q, "PA 2027 R = Q");
  assertEq(l.T, l.R, "PA 2027 T = R");
  assertEq(l.J, null, "PA 2027 J não calculado");
  assertEq("_enturmacao" in l.conflitos, true, "PA 2027 sinaliza enturmação pendente");
}

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} TESTE(S) FALHARAM`);
if (falhas > 0) {
  // @ts-ignore - Deno.exit / process.exit conforme runtime
  (globalThis as any).process?.exit(1);
}
