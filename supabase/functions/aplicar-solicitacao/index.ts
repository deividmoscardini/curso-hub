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

/**
 * Fase 8 — aplica mudança pontual em UMA linha de calendario_linhas.
 * Usada pelos 4 handlers de alteração de data. Faz:
 *   1) busca a linha por (tenant_id, chave_natural)
 *   2) update em dados[campo]
 *   3) append de evento em comentarios[]
 * Retorna {ok, erro?, valor_anterior, valor_novo}.
 */
async function aplicarMudancaEmLinha(
  sb: SupabaseClient,
  args: {
    tenant_id: string;
    chave_natural: string;
    campo: string;
    novo_valor: unknown;
    motivo: string;
    solicitacao_id: string;
    autor_id: string;
    validar?: (linha: { dados: Record<string, unknown> }) => string | null;
  },
): Promise<{ ok: boolean; erro?: string; status?: number; valor_anterior?: unknown }> {
  const { data: linha, error: eBusca } = await sb
    .from("calendario_linhas")
    .select("id, dados, comentarios")
    .eq("tenant_id", args.tenant_id)
    .eq("chave_natural", args.chave_natural)
    .single();
  if (eBusca || !linha) {
    return { ok: false, erro: `Linha ${args.chave_natural} não encontrada`, status: 404 };
  }

  const dados = (linha.dados ?? {}) as Record<string, unknown>;
  if (args.validar) {
    const erroValidacao = args.validar({ dados });
    if (erroValidacao) return { ok: false, erro: erroValidacao, status: 400 };
  }

  const valor_anterior = dados[args.campo];
  const novosDados = { ...dados, [args.campo]: args.novo_valor };
  const evento = {
    criado_em: new Date().toISOString(),
    autor_id: args.autor_id,
    motivo: args.motivo,
    solicitacao_id: args.solicitacao_id,
    tipo: "alteracao_solicitacao" as const,
    campo_alterado: args.campo,
    valor_anterior,
    valor_novo: args.novo_valor,
  };
  const comentariosAtuais = Array.isArray(linha.comentarios) ? linha.comentarios : [];
  const comentarios = [...comentariosAtuais, evento];

  const { error: eUpd } = await sb
    .from("calendario_linhas")
    .update({ dados: novosDados, comentarios })
    .eq("id", linha.id);
  if (eUpd) return { ok: false, erro: eUpd.message, status: 500 };

  return { ok: true, valor_anterior };
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

    // Fase 6.B3 — Anti-auto-aprovacao: solicitante nao pode aprovar
    // sua propria solicitacao (excecao: admin_global, que pode tudo).
    // Rejeitar/devolver a propria sim; aprovar nao.
    if (body.decisao === "aprovar" && solicitacao.solicitante_id === userId) {
      const { data: perfil } = await sbAdmin.from("perfis").select("admin_global").eq("id", userId).single();
      if (!perfil?.admin_global) {
        return json(403, { error: "Você não pode aprovar sua própria solicitação — aguarde um admin." });
      }
    }

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

      // Se o wizard incluiu prévia (o motor rodou pra gerar as ofertas do
      // ano de estreia junto com o cadastro), grava as linhas em
      // calendario_linhas apontando pro novo curso_id.
      let linhasGravadas = 0;
      const previaLinhas = ((solTyped.previa as { linhas?: unknown[] } | null)?.linhas) ?? [];
      if (previaLinhas.length > 0 && solTyped.aba === "disciplinas" && solTyped.ano) {
        const rows = (previaLinhas as any[]).map((linha) => {
          const { conflitos, ...dados } = linha;
          return {
            tenant_id: solicitacao.tenant_id,
            aba: "disciplinas",
            ano: solTyped.ano!,
            ordem: parseInt((linha.entrada as string).replace("E", ""), 10),
            curso_id: cursoIns.id,
            disciplina_id: null,
            chave_natural: `disciplinas-${solTyped.ano}-${cursoIns.codigo}-${linha.entrada}-${linha.ordem}`,
            dados, conflitos: conflitos ?? {},
          };
        });
        const { error: eLinhas } = await sbAdmin.from("calendario_linhas")
          .upsert(rows, { onConflict: "tenant_id,chave_natural" });
        if (eLinhas) return json(500, { error: `Falha ao gravar ofertas: ${eLinhas.message}` });
        linhasGravadas = rows.length;
      }

      logDepois = {
        curso_id: cursoIns.id, codigo: cursoIns.codigo,
        disciplinas: discs.length, ofertas_geradas: linhasGravadas,
      };
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
    } else if (
      solTyped.tipo === "alterar_data_live" ||
      solTyped.tipo === "alterar_data_termino" ||
      solTyped.tipo === "alterar_data_correcao" ||
      solTyped.tipo === "alterar_data_inicio"
    ) {
      // Fase 8 — Solicitações de alteração de data pontual.
      // Payload comum: { chave_natural, campo, nova_data, motivo }
      // Subtipo A/live também traz `campo` = chave da live específica.
      // Subtipo B/termino também atualiza campo secundário (atividade).
      // Subtipo D/inicio pode ter propagar_seguintes=true (futuro).
      const payload = (solTyped.payload ?? {}) as {
        chave_natural?: string;
        campo?: string;
        nova_data?: string;
        motivo?: string;
        propagar_seguintes?: boolean;
      };
      if (!payload.chave_natural || !payload.campo || !payload.nova_data || !payload.motivo?.trim()) {
        return json(400, {
          error: "Payload deve conter chave_natural, campo, nova_data e motivo.",
        });
      }

      // Subtipo A: valida que nova_data cai dentro do período da disciplina.
      // Chaves reais em `dados` vêm da planilha: "DATA  INÍCIO" (2 espaços) e "DATA FIM ".
      const validar =
        solTyped.tipo === "alterar_data_live"
          ? (linha: { dados: Record<string, unknown> }): string | null => {
              const inicio = (linha.dados["DATA  INÍCIO"] ?? linha.dados["DATA INÍCIO"] ?? null) as string | null;
              const fim = (linha.dados["DATA FIM "] ?? linha.dados["DATA FIM"] ?? null) as string | null;
              if (!inicio || !fim) return null; // sem período conhecido, não bloqueia
              if (payload.nova_data! < inicio || payload.nova_data! > fim) {
                return `Data ${payload.nova_data} fora do período da disciplina (${inicio} a ${fim}). Se precisa mesmo dessa data, abra também uma alteração de término da disciplina.`;
              }
              return null;
            }
          : undefined;

      const resultado = await aplicarMudancaEmLinha(sbAdmin, {
        tenant_id: solicitacao.tenant_id,
        chave_natural: payload.chave_natural,
        campo: payload.campo,
        novo_valor: payload.nova_data,
        motivo: payload.motivo,
        solicitacao_id: solicitacao.id,
        autor_id: userId,
        validar,
      });
      if (!resultado.ok) return json(resultado.status ?? 500, { error: resultado.erro });

      logDepois = {
        chave_natural: payload.chave_natural,
        campo_alterado: payload.campo,
        valor_anterior: resultado.valor_anterior,
        valor_novo: payload.nova_data,
      };

      // Subtipo B/termino: também atualiza campo de atividade (mesma linha).
      // Regra da Bruna: término da disciplina = término da entrega da atividade.
      if (solTyped.tipo === "alterar_data_termino") {
        const resAtividade = await aplicarMudancaEmLinha(sbAdmin, {
          tenant_id: solicitacao.tenant_id,
          chave_natural: payload.chave_natural,
          campo: "QUESTIONÁRIO (SEMANA 4)",
          novo_valor: payload.nova_data,
          motivo: `${payload.motivo} (propagação automática: término da atividade)`,
          solicitacao_id: solicitacao.id,
          autor_id: userId,
        });
        if (!resAtividade.ok) {
          // Não é fatal — só loga; o campo principal (término) já foi atualizado.
          logDepois = { ...logDepois, aviso_propagacao: resAtividade.erro };
        } else {
          logDepois = { ...logDepois, atividade_propagada: true };
        }
      }

      // Subtipo D com propagar_seguintes=true — TODO na próxima iteração:
      // chamar `calcular-previa` pra reprojetar as disciplinas seguintes do
      // mesmo curso/ano e materializar as linhas. Por ora só a linha
      // solicitada é alterada; propagação em massa entra depois quando o
      // motor der suporte a "âncora móvel por disciplina".
      if (solTyped.tipo === "alterar_data_inicio" && payload.propagar_seguintes) {
        logDepois = { ...logDepois, propagacao_pendente: true };
      }
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
