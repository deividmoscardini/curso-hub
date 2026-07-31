/**
 * Edge Function: calcular-previa
 *
 * Roda o motor de regras stateless (regras.ts) para uma combinação
 * aba/ano/âncora e devolve o relatório (linhas geradas + conflitos).
 *
 * Para 'disciplinas' e 'projeto_aplicacao', consulta o banco (tabelas
 * `cursos` + `disciplinas`) para montar o CursoMaster on-the-fly em vez
 * de depender do arquivo estático cursosMaster.ts — banco é a fonte da
 * verdade agora.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  gerarFechamentoTurmas,
  gerarProvaSubstitutiva,
  gerarDisciplinas,
  atribuirSufixosTurma,
  gerarProjetoAplicacao,
  type CursoMaster,
} from "../_shared/regras.ts";

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

interface Body {
  aba: "fechamento" | "prova_substitutiva" | "disciplinas" | "projeto_aplicacao";
  ano: number;
  ancora: string;
  primeira_oferta_do_ano?: number;
  tenant_id?: string;
  cod_curso?: string;
  ordem_inicial?: number;
  captacao_inicio?: string;
  termino_captacao_e1?: string;
  n_ofertas?: number;
  dias_i?: number;
}

async function buscarCursoMasterNoBanco(
  authHeader: string,
  tenantId: string,
  codCurso: string,
): Promise<CursoMaster | null> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: curso, error: erroC } = await sb
    .from("cursos")
    .select("id, codigo, sigla, nome")
    .eq("tenant_id", tenantId)
    .eq("codigo", codCurso)
    .maybeSingle();
  if (erroC || !curso) return null;

  const { data: discs, error: erroD } = await sb
    .from("disciplinas")
    .select("ordem_carrossel, nome, ch, tipo_oferta")
    .eq("curso_id", curso.id)
    .order("ordem_carrossel");
  if (erroD) return null;

  const carrossel = (discs ?? []).map((d) => ({
    ordem: d.ordem_carrossel,
    disciplina: d.nome,
    codigoDisciplina: null, // codigo real da disciplina viria de outra tabela; hoje nao gravamos separado
    tipoOferta: d.tipo_oferta,
    ch: d.ch,
    liveEstudoCasoOffset: 10, // padrao das aulas quinta; quarta = 9 (ajustar via regras_params no futuro)
    liveFechamentoOffset: 17, // idem
  }));

  return {
    sigla: curso.sigla,
    curso: curso.nome,
    diaSemanaDefault: "quinta", // TODO: buscar de regras_params por tenant/curso
    paCh: 60,
    paAnosElegiveis: [],
    paCodigoPrefixo: "",
    carrossel,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não suportado" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Faltou Authorization" });

    const body = (await req.json()) as Body;
    if (!body.aba) return json(400, { error: "aba obrigatória" });
    if (!body.ano || !Number.isInteger(body.ano)) return json(400, { error: "ano inteiro" });
    if (!body.ancora || !/^\d{4}-\d{2}-\d{2}$/.test(body.ancora))
      return json(400, { error: "ancora AAAA-MM-DD" });

    if (body.aba === "fechamento") {
      return json(200, { ok: true, linhas: gerarFechamentoTurmas(body.ano, body.ancora) });
    }

    if (body.aba === "prova_substitutiva") {
      return json(200, {
        ok: true,
        linhas: gerarProvaSubstitutiva(body.ano, body.primeira_oferta_do_ano ?? 1, body.ancora),
      });
    }

    // disciplinas e projeto_aplicacao precisam do curso
    if (!body.tenant_id || !body.cod_curso) {
      return json(400, { error: "tenant_id e cod_curso obrigatórios pra essa aba" });
    }
    const curso = await buscarCursoMasterNoBanco(authHeader, body.tenant_id, body.cod_curso);
    if (!curso) return json(404, { error: `Curso ${body.cod_curso} não encontrado no tenant` });

    if (body.aba === "disciplinas") {
      if (body.ordem_inicial == null || !body.captacao_inicio) {
        return json(400, { error: "ordem_inicial e captacao_inicio obrigatórios" });
      }
      const linhas = gerarDisciplinas(
        body.cod_curso, curso, body.ano, body.ancora,
        body.captacao_inicio, body.ordem_inicial, undefined, body.termino_captacao_e1,
      );
      atribuirSufixosTurma(linhas);
      return json(200, {
        ok: true, linhas,
        aviso: "Sufixo de turma compartilhada (tipo C) só fica correto quando o lote inteiro do ano é gerado junto.",
      });
    }

    if (body.aba === "projeto_aplicacao") {
      const linhas = gerarProjetoAplicacao(
        body.cod_curso, curso, body.ano, body.ancora,
        body.n_ofertas ?? 15, body.dias_i ?? 42,
      );
      return json(200, {
        ok: true, linhas,
        aviso: "DATA LIMITE DE ENTURMAÇÃO precisa ser validada com o RA antes de aplicar.",
      });
    }

    return json(400, { error: `aba desconhecida: ${body.aba}` });
  } catch (err) {
    return json(500, { error: String(err instanceof Error ? err.message : err) });
  }
});
