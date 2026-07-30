/**
 * Edge Function: preview-conflitos
 *
 * Dado uma solicitação com prévia calculada, retorna o DIFF de aplicação:
 * quais linhas seriam novas, quais alteradas, quais permaneceriam iguais,
 * e um resumo dos conflitos de feriado.
 *
 * Usado pelo painel do aprovador antes de aprovar — o approver vê exatamente
 * o que vai mudar no calendário sem precisar aplicar.
 *
 * Body: { solicitacao_id: string }
 *
 * Auth: bearer token do usuário. RLS controla o que ele consegue ler.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

interface Body { solicitacao_id: string }

function chaveDaLinha(
  aba: string,
  ano: number,
  cursoCodigo: string | null,
  linha: any,
): string {
  if (aba === "fechamento") return `fechamento-${ano}-${linha.oferta}`;
  if (aba === "prova_substitutiva") return `prova_sub-${ano}-${linha.oferta}`;
  if (aba === "disciplinas") {
    return `disciplinas-${ano}-${cursoCodigo ?? linha.codCurso}-${linha.entrada}-${linha.ordem}`;
  }
  if (aba === "projeto_aplicacao") return `pa-${ano}-${cursoCodigo ?? linha.codCurso}-${linha.oferta}`;
  return `${aba}-${ano}-desconhecido`;
}

function saoIguais(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não suportado" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Faltou o header Authorization" });
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { solicitacao_id } = (await req.json()) as Body;
    if (!solicitacao_id) return json(400, { error: "solicitacao_id é obrigatório" });

    const { data: sol, error: erroSol } = await sb
      .from("solicitacoes")
      .select("id, tenant_id, aba, ano, curso_id, previa")
      .eq("id", solicitacao_id)
      .single();
    if (erroSol || !sol) return json(404, { error: "Solicitação não encontrada" });
    if (!sol.previa || !sol.aba || !sol.ano) {
      return json(400, { error: "Solicitação sem prévia — nada a comparar" });
    }

    let cursoCodigo: string | null = null;
    if (sol.curso_id) {
      const { data: c } = await sb.from("cursos").select("codigo").eq("id", sol.curso_id).single();
      cursoCodigo = c?.codigo ?? null;
    }

    const linhas = (sol.previa as { linhas?: unknown[] })?.linhas ?? [];
    if (!Array.isArray(linhas) || linhas.length === 0) {
      return json(200, { ok: true, novas: [], alteradas: [], iguais: [], conflitos: [] });
    }

    // Chaves que vamos calcular
    const chaves = linhas.map((l: any) => chaveDaLinha(sol.aba!, sol.ano!, cursoCodigo, l));

    // Buscar todas as existentes numa query
    const { data: existentes, error: erroEx } = await sb
      .from("calendario_linhas")
      .select("chave_natural, dados, conflitos")
      .eq("tenant_id", sol.tenant_id)
      .in("chave_natural", chaves);
    if (erroEx) return json(500, { error: erroEx.message });

    const mapaExistentes = new Map<string, { dados: unknown; conflitos: unknown }>();
    for (const r of existentes ?? []) {
      mapaExistentes.set(r.chave_natural, { dados: r.dados, conflitos: r.conflitos });
    }

    const novas: unknown[] = [];
    const alteradas: Array<{ chave: string; antes: unknown; depois: unknown }> = [];
    const iguais: string[] = [];
    const conflitosResumo: Array<{ chave: string; conflitos: Record<string, string> }> = [];

    for (const [i, linha] of linhas.entries()) {
      const chave = chaves[i];
      const l = linha as { conflitos?: Record<string, string> };
      const { conflitos, ...dados } = l as any;
      const existente = mapaExistentes.get(chave);
      if (!existente) {
        novas.push({ chave, dados, conflitos: conflitos ?? {} });
      } else if (!saoIguais(existente.dados, dados)) {
        alteradas.push({ chave, antes: existente.dados, depois: dados });
      } else {
        iguais.push(chave);
      }
      if (conflitos && Object.keys(conflitos).length > 0) {
        conflitosResumo.push({ chave, conflitos });
      }
    }

    return json(200, {
      ok: true,
      resumo: {
        total: linhas.length,
        novas: novas.length,
        alteradas: alteradas.length,
        iguais: iguais.length,
        conflitos: conflitosResumo.length,
      },
      novas,
      alteradas,
      iguais,
      conflitos: conflitosResumo,
    });
  } catch (err) {
    return json(500, { error: String(err instanceof Error ? err.message : err) });
  }
});
