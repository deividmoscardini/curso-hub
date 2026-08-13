/**
 * Edge Function: recalcular-datas (Fase 11)
 *
 * Roda o motor JS de `_shared/regras.ts` em cima das linhas já existentes
 * em `calendario_linhas` para popular as datas derivadas (DATA FIM, LIVES,
 * QUESTIONÁRIO, etc.) que a importação da planilha deixou nulas.
 *
 * Body: {
 *   tenant_id: string,
 *   aba: "disciplinas" | "projeto_aplicacao" | "prova_substitutiva" | "fechamento",
 *   ano: number,
 *   curso_id?: string  // opcional; sem, roda pra todos os cursos do tenant/ano
 * }
 *
 * Auth: admin_global OU owner do tenant.
 *
 * O que preserva: `comentarios[]` (histórico de solicitações) fica
 * intocado. Só o `dados` jsonb é reescrito.
 *
 * Chaves do jsonb: mapeadas dos nomes camelCase do motor pros nomes
 * exatos do Excel (com espaços duplos e trailing spaces preservados).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  gerarDisciplinas,
  atribuirSufixosTurma,
  gerarProjetoAplicacao,
  gerarFechamentoTurmas,
  gerarProvaSubstitutiva,
  type CursoMaster,
  type LinhaDisciplina,
  type LinhaProjetoAplicacao,
  type LinhaFechamentoTurmas,
  type LinhaProvaSubstitutiva,
} from "../_shared/regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

interface Body {
  tenant_id: string;
  aba: "disciplinas" | "projeto_aplicacao" | "prova_substitutiva" | "fechamento";
  ano: number;
  curso_id?: string;
}

async function verificarPermissao(sb: SupabaseClient, tenantId: string): Promise<{ ok: boolean; erro?: string; userId?: string }> {
  const { data: userData, error: erroUser } = await sb.auth.getUser();
  if (erroUser || !userData?.user) return { ok: false, erro: "Usuário não autenticado" };
  const uid = userData.user.id;
  const { data: perfil } = await sb.from("perfis").select("admin_global").eq("id", uid).single();
  if (perfil?.admin_global) return { ok: true, userId: uid };
  const { data: membro } = await sb.from("membros").select("papel").eq("tenant_id", tenantId).eq("perfil_id", uid).single();
  if (!membro) return { ok: false, erro: "Você não é membro deste tenant" };
  if (!["owner"].includes(membro.papel)) return { ok: false, erro: `Papel '${membro.papel}' não pode recalcular datas` };
  return { ok: true, userId: uid };
}

/**
 * Mapeia LinhaDisciplina do motor pros headers exatos do Excel.
 * Preserva os "quirks" (dois espaços em DATA  INÍCIO, trailing spaces).
 */
function disciplinaParaExcel(linha: LinhaDisciplina): Record<string, unknown> {
  return {
    "ANO": linha.ano,
    "ENTRADA CAPTAÇÃO": linha.entrada,
    "INÍCIO CAPTAÇÃO": linha.inicioCaptacao,
    "TÉRMINO CAPTAÇÃO": linha.terminoCaptacao,
    "ESCOLA": linha.escola,
    "SIGLA": linha.sigla,
    "CÓD CURSO": linha.codCurso,
    "CURSO": linha.curso,
    "ORDEM DA DISCIPLINA": linha.ordem,
    "DISCIPLINA": linha.disciplina,
    "CÓDIGO DA TURMA ": linha.codigoTurma,
    "TIPO DE OFERTA": linha.tipoOferta,
    "CH": linha.ch,
    "DATA  INÍCIO": linha.dataInicio,
    "DATA FIM ": linha.dataFim,
    "DIA DA SEMANA DA LIVE": linha.diaSemanaLive,
    "LIVE ESTUDO DE CASO (SEMANA 2)": linha.liveEstudoCaso,
    "LIVE DE FECHAMENTO (SEMANA 3)": linha.liveFechamento,
    "QUESTIONÁRIO (SEMANA 4)": linha.questionario,
  };
}

function paParaExcel(linha: LinhaProjetoAplicacao): Record<string, unknown> {
  return {
    "ANO": linha.ano,
    "OFERTA": linha.oferta,
    "ESCOLA": "-",
    "SIGLA": linha.sigla,
    "CÓD CURSO": linha.codCurso,
    "CURSO": linha.curso,
    "CH": linha.ch,
    "CÓDIGO DA TURMA": linha.codigoTurma,
    "DIA DA SEMANA": linha.diaSemana,
    "DATA INÍCIO": linha.H,
    "DATA FIM": linha.I,
    "DATA LIMITE DE ENTURMAÇÃO": linha.J,
    "L": linha.L, "M": linha.M, "N": linha.N, "O": linha.O,
    "P": linha.P, "Q": linha.Q, "R": linha.R, "S": linha.S, "T": linha.T, "U": linha.U,
  };
}

function fechamentoParaExcel(linha: LinhaFechamentoTurmas): Record<string, unknown> {
  return {
    "ANO": linha.ano, "OFERTA": linha.oferta,
    "DATA INÍCIO DO PROJETO DE APLICAÇÃO": linha.B,
    "DATA FINAL DO PROJETO DE APLICAÇÃO": linha.C,
    "ENCERRAMENTO DOS PROTOCOLOS": linha.D,
    "ENVIO DA RELAÇÃO DE TURMAS P/ RA": linha.E,
    "FECHAMENTO DAS TURMAS": linha.G,
    "BASE PRONTA": linha.H,
  };
}

function provaSubParaExcel(linha: LinhaProvaSubstitutiva): Record<string, unknown> {
  return {
    "ANO": linha.ano, "OFERTA": linha.oferta,
    "C": linha.C, "D": linha.D, "E": linha.E, "F": linha.F, "G": linha.G,
    "H": linha.H, "I": linha.I, "J": linha.J, "K": linha.K,
    "INÍCIO DA PROVA": linha.L,
    "M": linha.M, "N": linha.N, "O": linha.O, "P": linha.P,
  };
}

async function buscarCursoMaster(sb: SupabaseClient, tenantId: string, cursoId: string): Promise<CursoMaster | null> {
  const { data: curso } = await sb.from("cursos").select("id, codigo, sigla, nome").eq("id", cursoId).maybeSingle();
  if (!curso) return null;
  const { data: discs } = await sb.from("disciplinas")
    .select("ordem_carrossel, nome, ch, tipo_oferta")
    .eq("curso_id", cursoId).order("ordem_carrossel");
  const carrossel = (discs ?? []).map((d) => ({
    ordem: d.ordem_carrossel,
    disciplina: d.nome,
    codigoDisciplina: null,
    tipoOferta: d.tipo_oferta,
    ch: d.ch,
    liveEstudoCasoOffset: 10, // quinta-feira default; ajustar via regras_params depois
    liveFechamentoOffset: 17,
  }));
  return {
    sigla: curso.sigla, curso: curso.nome,
    diaSemanaDefault: "quinta",
    paCh: 60, paAnosElegiveis: [], paCodigoPrefixo: "",
    carrossel,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não suportado" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Faltou Authorization" });

    const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = (await req.json()) as Body;
    if (!body.tenant_id || !body.aba || !body.ano) {
      return json(400, { error: "tenant_id, aba e ano são obrigatórios" });
    }

    const perm = await verificarPermissao(sbUser, body.tenant_id);
    if (!perm.ok) return json(403, { error: perm.erro });

    const avisos: string[] = [];
    let linhasAtualizadas = 0;
    let cursosProcessados = 0;

    if (body.aba === "disciplinas") {
      // Buscar cursos do tenant (ou 1 curso específico).
      let cursosQ = sbAdmin.from("cursos").select("id, codigo, sigla, nome").eq("tenant_id", body.tenant_id);
      if (body.curso_id) cursosQ = cursosQ.eq("id", body.curso_id);
      const { data: cursos } = await cursosQ;
      if (!cursos || cursos.length === 0) return json(404, { error: "Nenhum curso encontrado" });

      for (const curso of cursos) {
        const master = await buscarCursoMaster(sbAdmin, body.tenant_id, curso.id);
        if (!master) { avisos.push(`${curso.codigo}: sem carrossel`); continue; }

        // Ler linha E1 do ano pra pegar as âncoras (DATA INÍCIO, INÍCIO CAPTAÇÃO).
        const { data: linhaE1 } = await sbAdmin.from("calendario_linhas")
          .select("dados")
          .eq("tenant_id", body.tenant_id).eq("aba", "disciplinas").eq("ano", body.ano)
          .eq("curso_id", curso.id).eq("ordem", 1).maybeSingle();
        const dadosE1 = (linhaE1?.dados ?? {}) as Record<string, string | null>;
        const dataInicioE1 = dadosE1["DATA  INÍCIO"] ?? dadosE1["DATA INÍCIO"];
        const captacaoInicioE1 = dadosE1["INÍCIO CAPTAÇÃO"];
        if (!dataInicioE1 || !captacaoInicioE1) {
          avisos.push(`${curso.codigo}/${body.ano}: âncora E1 não preenchida (DATA INÍCIO ou INÍCIO CAPTAÇÃO)`);
          continue;
        }

        // Rodar motor.
        const linhasMotor = gerarDisciplinas(curso.codigo, master, body.ano, dataInicioE1, captacaoInicioE1, 1);
        atribuirSufixosTurma(linhasMotor);

        // Upsert com dados novos, preservando comentarios e conflitos existentes se houver.
        for (const linhaMotor of linhasMotor) {
          const chave = `disciplinas-${body.ano}-${curso.codigo}-${linhaMotor.entrada}-${linhaMotor.ordem}`;
          const dadosNovos = disciplinaParaExcel(linhaMotor);
          const { data: existente } = await sbAdmin.from("calendario_linhas")
            .select("id, comentarios").eq("tenant_id", body.tenant_id).eq("chave_natural", chave).maybeSingle();
          if (existente) {
            await sbAdmin.from("calendario_linhas").update({
              dados: dadosNovos,
              conflitos: linhaMotor.conflitos ?? {},
            }).eq("id", existente.id);
          } else {
            await sbAdmin.from("calendario_linhas").insert({
              tenant_id: body.tenant_id, aba: "disciplinas", ano: body.ano,
              ordem: parseInt(linhaMotor.entrada.replace("E", ""), 10),
              curso_id: curso.id, disciplina_id: null,
              chave_natural: chave, dados: dadosNovos,
              conflitos: linhaMotor.conflitos ?? {}, comentarios: [],
            });
          }
          linhasAtualizadas++;
        }
        cursosProcessados++;
      }
    } else if (body.aba === "projeto_aplicacao") {
      let cursosQ = sbAdmin.from("cursos").select("id, codigo, sigla, nome").eq("tenant_id", body.tenant_id);
      if (body.curso_id) cursosQ = cursosQ.eq("id", body.curso_id);
      const { data: cursos } = await cursosQ;
      if (!cursos || cursos.length === 0) return json(404, { error: "Nenhum curso encontrado" });

      for (const curso of cursos) {
        const master = await buscarCursoMaster(sbAdmin, body.tenant_id, curso.id);
        if (!master) { avisos.push(`${curso.codigo}: sem carrossel`); continue; }

        const { data: linhaO1 } = await sbAdmin.from("calendario_linhas")
          .select("dados")
          .eq("tenant_id", body.tenant_id).eq("aba", "projeto_aplicacao").eq("ano", body.ano)
          .eq("curso_id", curso.id).eq("ordem", 1).maybeSingle();
        const dadosO1 = (linhaO1?.dados ?? {}) as Record<string, string | null>;
        const anchorH1 = dadosO1["DATA INÍCIO"] ?? dadosO1["H"];
        if (!anchorH1) {
          avisos.push(`${curso.codigo}/${body.ano} PA: âncora oferta 1 (DATA INÍCIO) não preenchida`);
          continue;
        }

        const linhasMotor = gerarProjetoAplicacao(curso.codigo, master, body.ano, anchorH1);
        for (const linhaMotor of linhasMotor) {
          const chave = `pa-${body.ano}-${curso.codigo}-${linhaMotor.oferta}`;
          const dadosNovos = paParaExcel(linhaMotor);
          const { data: existente } = await sbAdmin.from("calendario_linhas")
            .select("id").eq("tenant_id", body.tenant_id).eq("chave_natural", chave).maybeSingle();
          if (existente) {
            await sbAdmin.from("calendario_linhas").update({
              dados: dadosNovos, conflitos: linhaMotor.conflitos ?? {},
            }).eq("id", existente.id);
          } else {
            await sbAdmin.from("calendario_linhas").insert({
              tenant_id: body.tenant_id, aba: "projeto_aplicacao", ano: body.ano,
              ordem: linhaMotor.oferta, curso_id: curso.id, disciplina_id: null,
              chave_natural: chave, dados: dadosNovos,
              conflitos: linhaMotor.conflitos ?? {}, comentarios: [],
            });
          }
          linhasAtualizadas++;
        }
        cursosProcessados++;
      }
    } else if (body.aba === "fechamento") {
      // Fechamento é global do ano (não por curso). Âncora = B da oferta 1.
      const { data: linhaO1 } = await sbAdmin.from("calendario_linhas")
        .select("dados")
        .eq("tenant_id", body.tenant_id).eq("aba", "fechamento").eq("ano", body.ano)
        .eq("ordem", 1).maybeSingle();
      const dadosO1 = (linhaO1?.dados ?? {}) as Record<string, string | null>;
      const anchorB1 = dadosO1["B"] ?? dadosO1["DATA INÍCIO DO PROJETO DE APLICAÇÃO"];
      if (!anchorB1) return json(400, { error: "âncora oferta 1 (B) não preenchida em fechamento/ano" });
      const linhasMotor = gerarFechamentoTurmas(body.ano, anchorB1);
      for (const linhaMotor of linhasMotor) {
        const chave = `fechamento-${body.ano}-${linhaMotor.oferta}`;
        const dadosNovos = fechamentoParaExcel(linhaMotor);
        const { data: existente } = await sbAdmin.from("calendario_linhas")
          .select("id").eq("tenant_id", body.tenant_id).eq("chave_natural", chave).maybeSingle();
        if (existente) {
          await sbAdmin.from("calendario_linhas").update({
            dados: dadosNovos, conflitos: linhaMotor.conflitos ?? {},
          }).eq("id", existente.id);
        } else {
          await sbAdmin.from("calendario_linhas").insert({
            tenant_id: body.tenant_id, aba: "fechamento", ano: body.ano,
            ordem: linhaMotor.oferta, curso_id: null, disciplina_id: null,
            chave_natural: chave, dados: dadosNovos,
            conflitos: linhaMotor.conflitos ?? {}, comentarios: [],
          });
        }
        linhasAtualizadas++;
      }
      cursosProcessados = 1;
    } else if (body.aba === "prova_substitutiva") {
      const { data: linhaO1 } = await sbAdmin.from("calendario_linhas")
        .select("dados, ordem")
        .eq("tenant_id", body.tenant_id).eq("aba", "prova_substitutiva").eq("ano", body.ano)
        .order("ordem", { ascending: true }).limit(1).maybeSingle();
      const dadosO1 = (linhaO1?.dados ?? {}) as Record<string, string | null>;
      const anchorC1 = dadosO1["C"];
      if (!anchorC1) return json(400, { error: "âncora oferta 1 (C) não preenchida em prova_substitutiva/ano" });
      const primeiraOferta = (linhaO1?.ordem as number | undefined) ?? 1;
      const linhasMotor = gerarProvaSubstitutiva(body.ano, primeiraOferta, anchorC1);
      for (const linhaMotor of linhasMotor) {
        const chave = `prova_sub-${body.ano}-${linhaMotor.oferta}`;
        const dadosNovos = provaSubParaExcel(linhaMotor);
        const { data: existente } = await sbAdmin.from("calendario_linhas")
          .select("id").eq("tenant_id", body.tenant_id).eq("chave_natural", chave).maybeSingle();
        if (existente) {
          await sbAdmin.from("calendario_linhas").update({
            dados: dadosNovos, conflitos: linhaMotor.conflitos ?? {},
          }).eq("id", existente.id);
        } else {
          await sbAdmin.from("calendario_linhas").insert({
            tenant_id: body.tenant_id, aba: "prova_substitutiva", ano: body.ano,
            ordem: linhaMotor.oferta, curso_id: null, disciplina_id: null,
            chave_natural: chave, dados: dadosNovos,
            conflitos: linhaMotor.conflitos ?? {}, comentarios: [],
          });
        }
        linhasAtualizadas++;
      }
      cursosProcessados = 1;
    }

    // Audit log.
    await sbAdmin.from("log_auditoria").insert({
      tenant_id: body.tenant_id,
      ator_id: perm.userId ?? null,
      acao: "calendario.recalcular_datas",
      entidade: "calendario_linhas",
      depois: { aba: body.aba, ano: body.ano, linhas: linhasAtualizadas, cursos: cursosProcessados, avisos },
    });

    return json(200, { ok: true, linhas_atualizadas: linhasAtualizadas, cursos_processados: cursosProcessados, avisos });
  } catch (err) {
    return json(500, { error: String(err instanceof Error ? err.message : err) });
  }
});
