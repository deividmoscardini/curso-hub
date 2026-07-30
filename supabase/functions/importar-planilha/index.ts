/**
 * Edge Function: importar-planilha
 *
 * Seed inicial de um tenant a partir do .xlsx real do 411 PUC RIO COLLAB
 * (ou qualquer planilha no mesmo formato). Lê 6 abas — Relação de Cursos,
 * Carrossel Fixo, Disciplinas, Projeto de Aplicação, Prova Substitutiva,
 * Fechamento de turmas — e popula: `cursos`, `disciplinas`, e
 * `calendario_linhas` (as 4 abas operacionais).
 *
 * Rodado 1x por tenant. Idempotente: usa upsert por (tenant_id, codigo)
 * em cursos e (tenant_id, chave_natural) em calendario_linhas, então
 * rodar de novo com uma planilha atualizada é seguro.
 *
 * Body: {
 *   tenant_id: string,           // UUID do tenant destino
 *   arquivo_base64: string       // conteúdo do .xlsx em base64
 * }
 *
 * Auth: bearer token. Usuário precisa ser admin_global ou owner do tenant.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

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
  tenant_id: string;
  arquivo_base64: string;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/** Converte serial-date do Excel (número) para ISO 'AAAA-MM-DD'. */
function excelDateToISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    // Já pode vir formatada
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Excel serial: dias desde 1899-12-30 (UTC)
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function normalizarString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normalizarInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function verificarPermissao(
  sb: SupabaseClient,
  tenantId: string,
): Promise<{ ok: boolean; erro?: string; user_id?: string }> {
  const { data: userData, error } = await sb.auth.getUser();
  if (error || !userData?.user) return { ok: false, erro: "Não autenticado" };
  const uid = userData.user.id;
  const { data: perfil } = await sb.from("perfis").select("admin_global").eq("id", uid).single();
  if (perfil?.admin_global) return { ok: true, user_id: uid };

  const { data: membro } = await sb
    .from("membros")
    .select("papel")
    .eq("tenant_id", tenantId)
    .eq("perfil_id", uid)
    .single();
  if (membro?.papel === "owner") return { ok: true, user_id: uid };
  return { ok: false, erro: "Só admin ou owner do tenant pode importar planilha" };
}

/**
 * Lê a aba "Relação de Cursos" e insere/atualiza cursos.
 * Colunas esperadas (docx seção 3.5): ESCOLA, SIGLA, CÓD CURSO, CURSO,
 * CAPTAÇÃO, TURMAS 2026, TURMAS 2027, PA 2027, PA 2028.
 */
async function importarCursos(
  sbAdmin: SupabaseClient,
  workbook: XLSX.WorkBook,
  tenantId: string,
): Promise<{ inseridos: number; codigos: Map<string, string> }> {
  const sheet = workbook.Sheets["Relação de Cursos"] ?? workbook.Sheets["Relacao de Cursos"];
  if (!sheet) throw new Error("Aba 'Relação de Cursos' não encontrada");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const codigos = new Map<string, string>(); // codigo → curso_id

  for (const row of rows) {
    const codigo = normalizarString(row["CÓD CURSO"] ?? row["COD CURSO"]);
    const sigla = normalizarString(row["SIGLA"]);
    const nome = normalizarString(row["CURSO"]);
    if (!codigo || !sigla || !nome) continue;

    const captacao = normalizarString(row["CAPTAÇÃO"] ?? row["CAPTACAO"]) ?? "";
    let status: "em_andamento" | "cancelado" | "descontinuado" = "em_andamento";
    if (/cancelado/i.test(captacao)) status = "cancelado";
    else if (/descontinuado/i.test(captacao)) status = "descontinuado";

    const flags: Record<string, unknown> = {};
    for (const c of ["TURMAS 2026", "TURMAS 2027", "PA 2027", "PA 2028"]) {
      if (row[c] != null) flags[c.toLowerCase().replace(" ", "_")] = row[c];
    }

    const { data, error } = await sbAdmin
      .from("cursos")
      .upsert(
        {
          tenant_id: tenantId,
          codigo,
          sigla,
          escola: normalizarString(row["ESCOLA"]),
          nome,
          status,
          flags_prontidao: flags,
        },
        { onConflict: "tenant_id,codigo" },
      )
      .select("id, codigo")
      .single();
    if (error) throw new Error(`Curso ${codigo}: ${error.message}`);
    if (data) codigos.set(data.codigo, data.id);
  }
  return { inseridos: codigos.size, codigos };
}

/**
 * Lê a aba "Carrossel Fixo" e insere disciplinas. Colunas esperadas
 * (docx 3.6): ESCOLA, SIGLA, CÓD CURSO, CURSO, DISCIPLINA. A ordem
 * vem da posição na lista dentro de cada curso.
 */
async function importarDisciplinas(
  sbAdmin: SupabaseClient,
  workbook: XLSX.WorkBook,
  tenantId: string,
  cursosPorCodigo: Map<string, string>,
): Promise<{ inseridas: number }> {
  const sheet = workbook.Sheets["Carrossel Fixo"];
  if (!sheet) throw new Error("Aba 'Carrossel Fixo' não encontrada");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  // Agrupa por curso, mantendo ordem
  const porCurso = new Map<string, string[]>();
  for (const row of rows) {
    const codigo = normalizarString(row["CÓD CURSO"] ?? row["COD CURSO"]);
    const disciplina = normalizarString(row["DISCIPLINA"]);
    if (!codigo || !disciplina) continue;
    if (!porCurso.has(codigo)) porCurso.set(codigo, []);
    porCurso.get(codigo)!.push(disciplina);
  }

  let inseridas = 0;
  for (const [codigo, disciplinas] of porCurso) {
    const cursoId = cursosPorCodigo.get(codigo);
    if (!cursoId) continue;
    for (let i = 0; i < disciplinas.length; i++) {
      const { error } = await sbAdmin.from("disciplinas").upsert(
        {
          tenant_id: tenantId,
          curso_id: cursoId,
          ordem_carrossel: i + 1,
          nome: disciplinas[i],
          tipo_oferta: "A",
        },
        { onConflict: "curso_id,ordem_carrossel" },
      );
      if (error) throw new Error(`Disciplina ${codigo} #${i+1}: ${error.message}`);
      inseridas++;
    }
  }
  return { inseridas };
}

interface LinhaBanco {
  tenant_id: string;
  aba: string;
  ano: number;
  ordem: number;
  curso_id: string | null;
  disciplina_id: string | null;
  chave_natural: string;
  dados: Record<string, unknown>;
  conflitos: Record<string, unknown>;
}

/** Importa uma aba operacional preservando todas as colunas em `dados` jsonb. */
function extrairLinhasGenerico(
  workbook: XLSX.WorkBook,
  nomesPossiveis: string[],
  aba: string,
  tenantId: string,
  cursosPorCodigo: Map<string, string>,
  chaveFn: (row: Record<string, unknown>, i: number) => { chave: string; ordem: number; ano: number; codigo: string | null } | null,
): LinhaBanco[] {
  let sheet: XLSX.WorkSheet | undefined;
  for (const n of nomesPossiveis) {
    if (workbook.Sheets[n]) { sheet = workbook.Sheets[n]; break; }
  }
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  const linhas: LinhaBanco[] = [];

  for (const [i, raw] of rows.entries()) {
    // Normaliza todas as colunas de data
    const dados: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v == null) { dados[k] = null; continue; }
      // Heurística: se coluna contém "DATA" ou "INÍCIO" ou "FIM" ou "LIVE" ou "QUESTIONÁRIO" e é número, tentar como data
      if (typeof v === "number" && /DATA|INÍCIO|INICIO|FIM|LIVE|QUESTION|ENCERRAMENTO|ABERTURA|FECHAMENTO|APLICAÇÃO|APLICACAO|CAPTAÇÃO|CAPTACAO|TÉRMINO|TERMINO|ENTREGA|LIMITE/i.test(k)) {
        const iso = excelDateToISO(v);
        dados[k] = iso ?? v;
      } else {
        dados[k] = v;
      }
    }

    const meta = chaveFn(raw, i);
    if (!meta) continue;
    const cursoId = meta.codigo ? cursosPorCodigo.get(meta.codigo) ?? null : null;
    linhas.push({
      tenant_id: tenantId,
      aba,
      ano: meta.ano,
      ordem: meta.ordem,
      curso_id: cursoId,
      disciplina_id: null,
      chave_natural: meta.chave,
      dados,
      conflitos: {},
    });
  }
  return linhas;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não suportado" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Faltou Authorization" });

    const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { tenant_id, arquivo_base64 } = (await req.json()) as Body;
    if (!tenant_id || !arquivo_base64) {
      return json(400, { error: "tenant_id e arquivo_base64 são obrigatórios" });
    }

    const permissao = await verificarPermissao(sbUser, tenant_id);
    if (!permissao.ok) return json(403, { error: permissao.erro });

    // Parse do xlsx
    const bytes = base64ToUint8Array(arquivo_base64);
    const wb = XLSX.read(bytes, { type: "array", cellDates: false });

    // 1. Cursos
    const { inseridos: nCursos, codigos: cursosPorCodigo } = await importarCursos(
      sbAdmin, wb, tenant_id,
    );

    // 2. Disciplinas
    const { inseridas: nDisciplinas } = await importarDisciplinas(
      sbAdmin, wb, tenant_id, cursosPorCodigo,
    );

    // 3. Ofertas (aba Disciplinas)
    const linhasDisciplinas = extrairLinhasGenerico(
      wb, ["Disciplinas"], "disciplinas", tenant_id, cursosPorCodigo,
      (row, i) => {
        const ano = normalizarInt(row["ANO"]);
        const entrada = normalizarString(row["ENTRADA CAPTAÇÃO"] ?? row["ENTRADA CAPTACAO"] ?? row["ENTRADA"]);
        const codigo = normalizarString(row["CÓD CURSO"] ?? row["COD CURSO"]);
        const ordem = normalizarInt(row["ORDEM DA DISCIPLINA"] ?? row["ORDEM"]);
        if (!ano || !entrada || !codigo || ordem == null) return null;
        return {
          chave: `disciplinas-${ano}-${codigo}-${entrada}-${ordem}`,
          ordem: parseInt(entrada.replace(/[^0-9]/g, ""), 10) || i,
          ano, codigo,
        };
      },
    );

    // 4. PA
    const linhasPA = extrairLinhasGenerico(
      wb, ["Projeto de Aplicação", "Projeto de Aplicacao"], "projeto_aplicacao", tenant_id, cursosPorCodigo,
      (row) => {
        const ano = normalizarInt(row["ANO"]);
        const codigo = normalizarString(row["CÓD CURSO"] ?? row["COD CURSO"]);
        const oferta = normalizarInt(row["OFERTA"] ?? row["Nº OFERTA"] ?? row["N OFERTA"]);
        if (!ano || !codigo || oferta == null) return null;
        return { chave: `pa-${ano}-${codigo}-${oferta}`, ordem: oferta, ano, codigo };
      },
    );

    // 5. Prova Substitutiva
    const linhasProva = extrairLinhasGenerico(
      wb, ["Prova Substitutiva"], "prova_substitutiva", tenant_id, cursosPorCodigo,
      (row, i) => {
        const ano = normalizarInt(row["ANO"]);
        const oferta = normalizarInt(row["OFERTA"] ?? row["Nº OFERTA"] ?? row["N OFERTA"]);
        if (!ano || oferta == null) return null;
        return { chave: `prova_sub-${ano}-${oferta}`, ordem: oferta, ano, codigo: null };
      },
    );

    // 6. Fechamento
    const linhasFech = extrairLinhasGenerico(
      wb, ["Fechamento de turmas"], "fechamento", tenant_id, cursosPorCodigo,
      (row, i) => {
        const ano = normalizarInt(row["ANO"]);
        const oferta = normalizarInt(row["OFERTA"] ?? row["Nº OFERTA"] ?? row["N OFERTA"]);
        if (!ano || oferta == null) return null;
        return { chave: `fechamento-${ano}-${oferta}`, ordem: oferta, ano, codigo: null };
      },
    );

    // Upsert em lotes
    const todas = [...linhasDisciplinas, ...linhasPA, ...linhasProva, ...linhasFech];
    let gravadas = 0;
    const LOTE = 500;
    for (let i = 0; i < todas.length; i += LOTE) {
      const chunk = todas.slice(i, i + LOTE);
      const { error } = await sbAdmin
        .from("calendario_linhas")
        .upsert(chunk, { onConflict: "tenant_id,chave_natural" });
      if (error) throw new Error(`Upsert calendario_linhas lote ${i}: ${error.message}`);
      gravadas += chunk.length;
    }

    // Log de auditoria
    await sbAdmin.from("log_auditoria").insert({
      tenant_id,
      ator_id: permissao.user_id,
      acao: "planilha.importar",
      entidade: "calendario_linhas",
      depois: {
        cursos: nCursos,
        disciplinas: nDisciplinas,
        linhas: gravadas,
      },
    });

    return json(200, {
      ok: true,
      resumo: {
        cursos: nCursos,
        disciplinas: nDisciplinas,
        calendario_linhas: gravadas,
        por_aba: {
          disciplinas: linhasDisciplinas.length,
          projeto_aplicacao: linhasPA.length,
          prova_substitutiva: linhasProva.length,
          fechamento: linhasFech.length,
        },
      },
    });
  } catch (err) {
    return json(500, { error: String(err instanceof Error ? err.message : err) });
  }
});
