/**
 * Edge Function: calcular-previa
 *
 * Roda o motor de regras (regras.ts) para uma combinação aba/ano/âncora e
 * devolve o relatório (linhas geradas + conflitos de feriado). Puro cálculo:
 * não lê nem escreve no banco, é seguro chamar quantas vezes precisar
 * (ex.: prévia ao vivo no form, com debounce).
 *
 * Body esperado (JSON):
 *   {
 *     aba: "fechamento" | "prova_substitutiva" | "disciplinas" | "projeto_aplicacao",
 *     ano: number,
 *     ancora: "AAAA-MM-DD",
 *
 *     // fechamento: nada além do acima.
 *
 *     // prova_substitutiva: opcional
 *     primeira_oferta_do_ano?: number,     // default 1
 *
 *     // disciplinas: obrigatórios
 *     cod_curso?: string,                  // ex.: "411-393"
 *     ordem_inicial?: number,              // posição no carrossel
 *     captacao_inicio?: "AAAA-MM-DD",
 *     termino_captacao_e1?: "AAAA-MM-DD",  // opcional (docx aviso)
 *
 *     // projeto_aplicacao: cod_curso obrigatório
 *     cod_curso?: string,
 *     n_ofertas?: number,                  // default 15
 *     dias_i?: number,                     // default 42 (30 em 2026)
 *   }
 *
 * Response:
 *   { ok: true, linhas: [...], aviso?: string }
 *   { error: "..." } com status 400/500
 */
import {
  gerarFechamentoTurmas,
  gerarProvaSubstitutiva,
  gerarDisciplinas,
  atribuirSufixosTurma,
  gerarProjetoAplicacao,
} from "../_shared/regras.ts";
import { CURSOS_MASTER } from "../_shared/cursosMaster.ts";

interface Body {
  aba: "fechamento" | "prova_substitutiva" | "disciplinas" | "projeto_aplicacao";
  ano: number;
  ancora: string;
  primeira_oferta_do_ano?: number;
  cod_curso?: string;
  ordem_inicial?: number;
  captacao_inicio?: string;
  termino_captacao_e1?: string;
  n_ofertas?: number;
  dias_i?: number;
}

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

function validarBase(b: Body): string | null {
  if (!b.aba) return "aba é obrigatória";
  if (!b.ano || !Number.isInteger(b.ano)) return "ano deve ser inteiro";
  if (!b.ancora || !/^\d{4}-\d{2}-\d{2}$/.test(b.ancora)) {
    return "ancora deve estar em AAAA-MM-DD";
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não suportado" });

  try {
    const body = (await req.json()) as Body;
    const erroBase = validarBase(body);
    if (erroBase) return json(400, { error: erroBase });

    if (body.aba === "fechamento") {
      const linhas = gerarFechamentoTurmas(body.ano, body.ancora);
      return json(200, { ok: true, linhas });
    }

    if (body.aba === "prova_substitutiva") {
      const linhas = gerarProvaSubstitutiva(
        body.ano,
        body.primeira_oferta_do_ano ?? 1,
        body.ancora,
      );
      return json(200, { ok: true, linhas });
    }

    if (body.aba === "disciplinas") {
      if (!body.cod_curso) return json(400, { error: "cod_curso obrigatório em disciplinas" });
      const curso = CURSOS_MASTER[body.cod_curso];
      if (!curso) return json(400, { error: `cod_curso '${body.cod_curso}' não encontrado` });
      if (body.ordem_inicial == null || !body.captacao_inicio) {
        return json(400, {
          error: "ordem_inicial e captacao_inicio são obrigatórios em disciplinas",
        });
      }
      const linhas = gerarDisciplinas(
        body.cod_curso,
        curso,
        body.ano,
        body.ancora,
        body.captacao_inicio,
        body.ordem_inicial,
        undefined,
        body.termino_captacao_e1,
      );
      atribuirSufixosTurma(linhas);
      return json(200, {
        ok: true,
        linhas,
        aviso:
          "Prévia gerada só para este curso — o sufixo de turma compartilhada " +
          "(tipo C) só fica correto quando o lote inteiro do ano é gerado junto " +
          "(docx seção 5).",
      });
    }

    if (body.aba === "projeto_aplicacao") {
      if (!body.cod_curso) return json(400, { error: "cod_curso obrigatório em projeto_aplicacao" });
      const curso = CURSOS_MASTER[body.cod_curso];
      if (!curso) return json(400, { error: `cod_curso '${body.cod_curso}' não encontrado` });
      const linhas = gerarProjetoAplicacao(
        body.cod_curso,
        curso,
        body.ano,
        body.ancora,
        body.n_ofertas ?? 15,
        body.dias_i ?? 42,
      );
      return json(200, {
        ok: true,
        linhas,
        aviso:
          "DATA LIMITE DE ENTURMAÇÃO (coluna J) não é calculada — precisa ser " +
          "validada com o Registro Acadêmico antes de aplicar (docx seção 9.6).",
      });
    }

    return json(400, { error: `aba desconhecida: ${body.aba}` });
  } catch (err) {
    return json(500, { error: String(err instanceof Error ? err.message : err) });
  }
});
