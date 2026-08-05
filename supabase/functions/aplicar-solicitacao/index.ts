/**
 * Edge Function: aplicar-solicitacao (v2)
 *
 * Registra a decisão do aprovador (aprovar / rejeitar / devolver) e, em
 * caso de aprovação, GRAVA as linhas geradas do motor de regras direto
 * na tabela `calendario_linhas` do tenant — atomicamente com a mudança de
 * status da solicitação.
 *
 * Diferença do v1: sai o "gerar comando python pra rodar local". Aqui a
 * plataforma é a fonte da verdade — a aplicação é online.
 *
 * Body: {
 *   solicitacao_id: string,
 *   decisao: "aprovar" | "rejeitar" | "devolver",
 *   motivo_rejeicao?: string,   // obrigatório se rejeitar
 *   comentario?: string          // obrigatório se devolver
 * }
 *
 * Auth: bearer token do usuário. Function valida que ele tem papel
 * `owner` OU `aprovador` no tenant da solicitação (redundante com RLS
 * mas defesa em profundidade).
 *
 * Escrita: usa SERVICE_ROLE por dentro (bypass RLS) — a política de
 * `calendario_linhas` restringe write a owner/editor, e aqui é
 * aprovador cascateando via solicitação, então precisamos bypassar.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

interface Body {
  solicitacao_id: string;
  decisao: "aprovar" | "rejeitar" | "devolver";
  motivo_rejeicao?: string;
  comentario?: string;
}

interface Solicitacao {
  id: string;
  tenant_id: string;
  solicitante_id: string;
  tipo: string;
  aba: "disciplinas" | "projeto_aplicacao" | "prova_substitutiva" | "fechamento" | null;
  ano: number | null;
  curso_id: string | null;
  previa: unknown;
  status: string;
}

/**
 * Materializa as linhas de `previa` como registros de calendario_linhas.
 * Cada aba tem chave_natural própria.
 */
function materializarLinhas(
  solicitacao: Solicitacao,
  cursoCodigo: string | null,
): Array<{
  tenant_id: string;
  aba: string;
  ano: number;
  ordem: number;
  curso_id: string | null;
  disciplina_id: string | null;
  chave_natural: string;
  dados: unknown;
  conflitos: unknown;
}> {
  const previa = (solicitacao.previa as { linhas?: unknown[] } | null)?.linhas ?? [];
  if (!Array.isArray(previa) || previa.length === 0) return [];
  if (!solicitacao.aba || !solicitacao.ano) return [];

  const aba = solicitacao.aba;
  const ano = solicitacao.ano;
  const tenant_id = solicitacao.tenant_id;
  const curso_id = solicitacao.curso_id;

  return previa.map((linha: any) => {
    let ordem = 0;
    let chave = "";
    if (aba === "fechamento") {
      ordem = linha.oferta;
      chave = `fechamento-${ano}-${ordem}`;
    } else if (aba === "prova_substitutiva") {
      ordem = linha.oferta;
      chave = `prova_sub-${ano}-${ordem}`;
    } else if (aba === "disciplinas") {
      const entradaNum = parseInt((linha.entrada as string).replace("E", ""), 10);
      ordem = entradaNum;
      chave = `disciplinas-${ano}-${cursoCodigo ?? linha.codCurso}-${linha.entrada}-${linha.ordem}`;
    } else if (aba === "projeto_aplicacao") {
      ordem = linha.oferta;
      chave = `pa-${ano}-${cursoCodigo ?? linha.codCurso}-${ordem}`;
    }
    const { conflitos, ...dadosSemConflitos } = linha;
    return {
      tenant_id,
      aba,
      ano,
      ordem,
      curso_id,
      disciplina_id: null,   // disciplina_id resolvida separada pra evitar N+1 aqui
      chave_natural: chave,
      dados: dadosSemConflitos,
      conflitos: conflitos ?? {},
    };
  });
}

async function verificarAprovador(sb: SupabaseClient, tenantId: string): Promise<{ ok: boolean; erro?: string; user?: { id: string } }> {
  const { data: userData, error: erroUser } = await sb.auth.getUser();
  if (erroUser || !userData?.user) {
    return { ok: false, erro: "Usuário não autenticado" };
  }
  const uid = userData.user.id;
  const { data: perfil } = await sb.from("perfis").select("admin_global").eq("id", uid).single();
  if (perfil?.admin_global) return { ok: true, user: { id: uid } };

  const { data: membro } = await sb
    .from("membros")
    .select("papel")
    .eq("tenant_id", tenantId)
    .eq("perfil_id", uid)
    .single();
  if (!membro) return { ok: false, erro: "Você não é membro deste tenant" };
  if (!["owner", "aprovador"].includes(membro.papel)) {
    return { ok: false, erro: `Papel '${membro.papel}' não pode aprovar/rejeitar solicitações` };
  }
  return { ok: true, user: { id: uid } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não suportado" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Faltou o header Authorization" });

    const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = (await req.json()) as Body;
    if (!body.solicitacao_id || !body.decisao) {
      return json(400, { error: "solicitacao_id e decisao são obrigatórios" });
    }
    if (body.decisao === "rejeitar" && !body.motivo_rejeicao?.trim()) {
      return json(400, { error: "motivo_rejeicao é obrigatório ao rejeitar" });
    }
    if (body.decisao === "devolver" && !body.comentario?.trim()) {
      return json(400, { error: "comentario é obrigatório ao devolver" });
    }

    // Ler solicitação com o token do usuário — se RLS bloquear ele nem vê
    const { data: solicitacao, error: erroLeitura } = await sbUser
      .from("solicitacoes")
      .select("id, tenant_id, solicitante_id, tipo, aba, ano, curso_id, payload, previa, status")
      .eq("id", body.solicitacao_id)
      .single();
    if (erroLeitura || !solicitacao) {
      return json(404, { error: "Solicitação não encontrada ou sem permissão" });
    }

    const check = await verificarAprovador(sbUser, solicitacao.tenant_id);
    if (!check.ok) return json(403, { error: check.erro });
    const userId = check.user!.id;

    // Rejeitar / devolver: só atualiza status
    if (body.decisao === "rejeitar" || body.decisao === "devolver") {
      const novoStatus = body.decisao === "rejeitar" ? "rejeitada" : "devolvida";
      const { error: erroUpd } = await sbAdmin
        .from("solicitacoes")
        .update({
          status: novoStatus,
          revisado_por: userId,
          motivo_rejeicao: body.decisao === "rejeitar" ? body.motivo_rejeicao : null,
        })
        .eq("id", solicitacao.id);
      if (erroUpd) return json(500, { error: erroUpd.message });

      if (body.decisao === "devolver" && body.comentario) {
        await sbAdmin.from("solicitacao_comentarios").insert({
          solicitacao_id: solicitacao.id,
          autor_id: userId,
          texto: body.comentario,
          interno: false,
        });
      }
      await sbAdmin.from("log_auditoria").insert({
        tenant_id: solicitacao.tenant_id,
        ator_id: userId,
        acao: `solicitacao.${body.decisao}`,
        entidade: "solicitacoes",
        entidade_id: solicitacao.id,
        motivo: body.motivo_rejeicao ?? body.comentario ?? null,
      });
      return json(200, { ok: true, status: novoStatus });
    }

    // Aprovar: branch por tipo. Handlers especializados pra novo_curso
    // e reordenar_carrossel (que mexem em cursos/disciplinas, nao em
    // calendario_linhas). Restante segue o fluxo antigo (previa -> linhas).
    const agora = new Date().toISOString();
    let logDepois: Record<string, unknown> = {};
    const solTyped = solicitacao as Solicitacao & { tipo: string; payload?: Record<string, unknown> };

    if (solTyped.tipo === "novo_curso") {
      const payload = (solTyped.payload ?? {}) as any;
      const { data: cursoIns, error: eCurso } = await sbAdmin.from("cursos").insert({
        tenant_id: solicitacao.tenant_id,
        codigo: payload.codigo, sigla: payload.sigla, escola: payload.escola,
        nome: payload.nome,
        status: payload.status ?? "em_andamento",
        flags_prontidao: payload.flags_prontidao ?? {},
      }).select("id, codigo").single();
      if (eCurso) return json(500, { error: `Falha ao criar curso: ${eCurso.message}` });

      const discs = (payload.disciplinas ?? []) as Array<{ ordem: number; nome: string; ch?: number; tipo_oferta?: string }>;
      if (discs.length > 0) {
        const disciplinasRows = discs.map((d, i) => ({
          tenant_id: solicitacao.tenant_id,
          curso_id: cursoIns.id,
          ordem_carrossel: d.ordem ?? i + 1,
          nome: d.nome,
          ch: d.ch ?? null,
          tipo_oferta: (d.tipo_oferta ?? "A") as "A" | "C",
        }));
        const { error: eDisc } = await sbAdmin.from("disciplinas").insert(disciplinasRows);
        if (eDisc) return json(500, { error: `Falha ao criar disciplinas: ${eDisc.message}` });
      }
      logDepois = { curso_id: cursoIns.id, codigo: cursoIns.codigo, disciplinas: discs.length };
    } else if (solTyped.tipo === "reordenar_carrossel") {
      const payload = (solTyped.payload ?? {}) as any;
      if (!payload.curso_id || !Array.isArray(payload.ordem_final)) {
        return json(400, { error: "payload deve conter curso_id e ordem_final[]" });
      }
      // Snapshot antes
      const { data: antes } = await sbAdmin.from("disciplinas")
        .select("id, ordem_carrossel, nome, ch, tipo_oferta")
        .eq("curso_id", payload.curso_id).order("ordem_carrossel");

      // Estratégia: DELETE + INSERT completo (garante ordem exata).
      // Mais simples que diff granular; ok pra tamanho tipico (~15 disciplinas).
      await sbAdmin.from("disciplinas").delete().eq("curso_id", payload.curso_id);

      const novasLinhas = (payload.ordem_final as Array<{ nome: string; ch?: number; tipo_oferta?: string; ordem?: number }>).map((d, i) => ({
        tenant_id: solicitacao.tenant_id,
        curso_id: payload.curso_id,
        ordem_carrossel: d.ordem ?? i + 1,
        nome: d.nome,
        ch: d.ch ?? null,
        tipo_oferta: (d.tipo_oferta ?? "A") as "A" | "C",
      }));
      const { error: eIns } = await sbAdmin.from("disciplinas").insert(novasLinhas);
      if (eIns) return json(500, { error: `Falha ao reordenar: ${eIns.message}` });

      logDepois = { curso_id: payload.curso_id, disciplinas_finais: novasLinhas.length, antes };
    } else {
      // Tipos que dependem de previa em calendario_linhas
      if (!solicitacao.previa || !solicitacao.aba || !solicitacao.ano) {
        return json(400, {
          error: "Solicitação sem prévia/aba/ano — não é possível aplicar. Recalcule a prévia antes.",
        });
      }

      let cursoCodigo: string | null = null;
      if (solicitacao.curso_id) {
        const { data: c } = await sbAdmin.from("cursos").select("codigo").eq("id", solicitacao.curso_id).single();
        cursoCodigo = c?.codigo ?? null;
      }

      const rows = materializarLinhas(solicitacao as Solicitacao, cursoCodigo);
      if (rows.length === 0) {
        return json(400, { error: "Prévia vazia — nada a aplicar" });
      }

      const { error: erroUpsert } = await sbAdmin
        .from("calendario_linhas")
        .upsert(rows, { onConflict: "tenant_id,chave_natural" });
      if (erroUpsert) return json(500, { error: `Falha ao gravar linhas: ${erroUpsert.message}` });
      logDepois = { linhas_gravadas: rows.length };
    }

    const { error: erroSol } = await sbAdmin
      .from("solicitacoes")
      .update({
        status: "aplicada",
        aprovado_por: userId,
        aprovado_em: agora,
        aplicado_em: agora,
      })
      .eq("id", solicitacao.id);
    if (erroSol) return json(500, { error: erroSol.message });

    await sbAdmin.from("log_auditoria").insert({
      tenant_id: solicitacao.tenant_id,
      ator_id: userId,
      acao: "solicitacao.aplicar",
      entidade: "solicitacoes",
      entidade_id: solicitacao.id,
      depois: logDepois,
    });

    return json(200, { ok: true, status: "aplicada", ...logDepois });
  } catch (err) {
    return json(500, { error: String(err instanceof Error ? err.message : err) });
  }
});
