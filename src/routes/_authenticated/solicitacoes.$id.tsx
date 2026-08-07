import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Check, X, RotateCcw, AlertTriangle, Copy, TrendingUp } from "lucide-react";
import { acharSimilar } from "@/lib/similaridade";
import { validarChMinima, TIPO_CURSO_LABEL, type TipoCurso } from "@/lib/regras-tipo-curso";
import { useT } from "@/contexts/i18n";

export const Route = createFileRoute("/_authenticated/solicitacoes/$id")({
  head: () => ({ meta: [{ title: "Solicitação — Calendário +A" }] }),
  component: SolicitacaoDetalhePage,
});

interface SolicitacaoDetalhe {
  id: string;
  tenant_id: string;
  solicitante_id: string;
  tipo: string;
  aba: string | null;
  ano: number | null;
  curso_id: string | null;
  payload: unknown;
  previa: unknown;
  status: string;
  motivo_rejeicao: string | null;
  criado_em: string;
  aprovado_em: string | null;
  aplicado_em: string | null;
  tenants: { nome: string } | null;
  solicitante: { nome: string; email: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", em_revisao: "Em revisão", aprovada: "Aprovada",
  aplicada: "Aplicada", rejeitada: "Rejeitada", devolvida: "Devolvida",
};
const STATUS_CLS: Record<string, string> = {
  pendente: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  em_revisao: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  aprovada: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  aplicada: "bg-emerald-600/20 text-emerald-800 dark:text-emerald-300",
  rejeitada: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  devolvida: "bg-slate-500/10 text-slate-700 dark:text-slate-400",
};

function SolicitacaoDetalhePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { perfil, papel } = useTenant();
  const { t } = useT();
  const STATUS_LABEL_LOCAL: Record<string, string> = {
    pendente: t("solicitacao_detalhe.status_pendente"),
    em_revisao: t("solicitacao_detalhe.status_pendente"),
    aprovada: t("solicitacao_detalhe.status_aprovada"),
    aplicada: t("solicitacao_detalhe.status_aplicada"),
    rejeitada: t("solicitacao_detalhe.status_rejeitada"),
    devolvida: t("solicitacao_detalhe.status_devolvida"),
  };
  const [rejeitando, setRejeitando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  // Fase 7.7 — A8: cada disciplina/linha marcada localmente como "OK" antes
  // de aprovar a solicitacao inteira. Sem mudanca de schema — client-side only.
  const [linhasOk, setLinhasOk] = useState<Set<string>>(new Set());
  const toggleLinha = (chave: string) => setLinhasOk((s) => {
    const n = new Set(s); n.has(chave) ? n.delete(chave) : n.add(chave); return n;
  });

  const { data: sol } = useQuery({
    queryKey: ["solicitacao", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes")
        .select(`
          id, tenant_id, solicitante_id, tipo, aba, ano, curso_id,
          payload, previa, status, motivo_rejeicao,
          criado_em, aprovado_em, aplicado_em,
          tenants(nome),
          solicitante:solicitante_id(nome, email)
        `)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SolicitacaoDetalhe | null;
    },
  });

  const podeDecidir = !!perfil && (perfil.admin_global || ["owner", "aprovador"].includes(papel ?? "")) &&
                     sol && ["pendente", "em_revisao"].includes(sol.status);

  const aplicar = useMutation({
    mutationFn: async (payload: { decisao: "aprovar" | "rejeitar" | "devolver"; motivo_rejeicao?: string; comentario?: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aplicar-solicitacao`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`, "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ solicitacao_id: id, ...payload }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error ?? t("solicitacao_detalhe.erro"));
      return json;
    },
    onSuccess: (r) => {
      toast.success(t("solicitacao_detalhe.solicitacao_status", { status: STATUS_LABEL_LOCAL[r.status] ?? r.status }));
      qc.invalidateQueries();
      setRejeitando(false); setDevolvendo(false);
    },
    onError: (err: Error) => toast.error(t("solicitacao_detalhe.falha"), { description: err.message }),
  });

  // Fase 7 — Analises estruturais visiveis ao aprovador (so em novo_curso)
  const analise = useAnaliseEstrutural(sol);
  // A8 — Para novo_curso, extrai chaves das disciplinas pra checar se
  // todas foram marcadas como OK antes de habilitar o botao "Aprovar".
  const chavesLinhas = (sol && sol.tipo === "novo_curso")
    ? ((sol.payload as any)?.disciplinas ?? []).map((d: any, i: number) => `disc-${i}-${d.nome}`)
    : [];
  const todasLinhasOk = chavesLinhas.length === 0 || chavesLinhas.every((c: string) => linhasOk.has(c));

  if (!sol) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("comum.carregando")}</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/solicitacoes" })}>
          <ArrowLeft className="mr-1 h-4 w-4" />{t("comum.voltar")}
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight capitalize">{sol.tipo.replace(/_/g, " ")}</h1>
            <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLS[sol.status] ?? ""}`}>
              {STATUS_LABEL_LOCAL[sol.status] ?? sol.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {sol.tenants?.nome} · {t("solicitacao_detalhe.pedido_por", { nome: sol.solicitante?.nome ?? "", data: new Date(sol.criado_em).toLocaleString() })}
          </p>
        </div>
        {podeDecidir && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDevolvendo(true)}>
              <RotateCcw className="mr-1 h-4 w-4" />{t("comum.devolver")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRejeitando(true)}>
              <X className="mr-1 h-4 w-4" />{t("comum.rejeitar")}
            </Button>
            <Button
              size="sm"
              onClick={() => aplicar.mutate({ decisao: "aprovar" })}
              disabled={aplicar.isPending || !todasLinhasOk}
              title={!todasLinhasOk ? t("solicitacao_detalhe.tooltip_marcar_todas") : undefined}
            >
              {aplicar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              {t("comum.aprovar")} {chavesLinhas.length > 0 && `(${linhasOk.size}/${chavesLinhas.length})`}
            </Button>
          </div>
        )}
      </div>

      {sol.motivo_rejeicao && (
        <Card className="border-rose-500/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("solicitacao_detalhe.motivo_rejeicao")}</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{sol.motivo_rejeicao}</p></CardContent>
        </Card>
      )}

      {/* A10 — Totalizador de CH */}
      {analise?.totalizador && (
        <Card className={analise.totalizador.validacao.ok ? "border-emerald-500/30" : "border-rose-500/40"}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className={`h-5 w-5 ${analise.totalizador.validacao.ok ? "text-emerald-600" : "text-rose-600"}`} />
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {t("solicitacao_detalhe.ch_total_lbl", { n: analise.totalizador.ch_total })}
                  {analise.totalizador.validacao.ch_minima > 0 && (
                    <span className="text-muted-foreground"> {t("solicitacao_detalhe.ch_minimo_lbl", { n: analise.totalizador.validacao.ch_minima })}</span>
                  )}
                </div>
                {!analise.totalizador.validacao.ok && (
                  <div className="text-xs text-rose-700 dark:text-rose-300">
                    {analise.totalizador.validacao.mensagem}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {analise.totalizador.tipo_curso ? TIPO_CURSO_LABEL[analise.totalizador.tipo_curso] : "—"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* A4 — Alertas de duplicação estrutural */}
      {analise?.duplicatas && analise.duplicatas.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <Copy className="h-4 w-4" />{t("solicitacao_detalhe.duplicatas_titulo", { n: analise.duplicatas.length })}
            </CardTitle>
            <CardDescription>{t("solicitacao_detalhe.duplicatas_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analise.duplicatas.map((d, i) => (
              <div key={i} className="text-xs">
                <div><span className="font-medium">"{d.novo_nome}"</span> — {t("solicitacao_detalhe.duplicatas_linha", { codigo: d.similar_nome, score: Math.round(d.score * 100) })}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* A5 — Divergência de CH entre disciplinas homônimas */}
      {analise?.divergencias && analise.divergencias.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />{t("solicitacao_detalhe.divergencias_titulo", { n: analise.divergencias.length })}
            </CardTitle>
            <CardDescription>{t("solicitacao_detalhe.divergencias_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analise.divergencias.map((d, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">"{d.nome}"</span>: {t("solicitacao_detalhe.divergencias_linha", { novo: d.ch_novo, existentes: d.ch_existentes })}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* A6 — Compartilhamento (disciplina C que já existe em outros cursos) */}
      {analise?.compartilhadas && analise.compartilhadas.length > 0 && (
        <Card className="border-sky-500/40 bg-sky-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-sky-800 dark:text-sky-300">
              <AlertTriangle className="h-4 w-4" />{t("solicitacao_detalhe.compartilhadas_titulo", { n: analise.compartilhadas.length })}
            </CardTitle>
            <CardDescription>{t("solicitacao_detalhe.compartilhadas_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analise.compartilhadas.map((c, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">"{c.nome}"</span> — {t("solicitacao_detalhe.compartilhadas_ja_em", { cursos: c.cursos.slice(0, 5).join(", ") })}{c.cursos.length > 5 && ` ${t("solicitacao_detalhe.compartilhadas_outros", { n: c.cursos.length - 5 })}`}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* A7 — Ortografia */}
      {analise?.ortografia && analise.ortografia.length > 0 && (
        <Card className="border-slate-400/40 bg-slate-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-300">
              <AlertTriangle className="h-4 w-4" />{t("solicitacao_detalhe.ortografia_titulo", { n: analise.ortografia.length })}
            </CardTitle>
            <CardDescription>{t("solicitacao_detalhe.ortografia_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analise.ortografia.map((o, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">"{o.nome}"</span> — {t(o.problema)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* A8 — Aprovacao por linha (novo_curso): tabela com checkbox por disciplina */}
      {sol.tipo === "novo_curso" && chavesLinhas.length > 0 && podeDecidir && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("solicitacao_detalhe.disciplinas_curso_titulo", { n: chavesLinhas.length })}</CardTitle>
            <CardDescription>{t("solicitacao_detalhe.disciplinas_curso_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-16 p-2 text-center">{t("solicitacao_detalhe.ok")}</th>
                    <th className="w-10 p-2">#</th>
                    <th className="p-2">{t("solicitacao_detalhe.disciplina_col")}</th>
                    <th className="w-16 p-2">{t("solicitacao_nova.ch")}</th>
                    <th className="w-20 p-2">{t("solicitacao_detalhe.tipo_col")}</th>
                    <th className="w-24 p-2 text-center">{t("solicitacao_nova.pre_requisito")}</th>
                  </tr>
                </thead>
                <tbody>
                  {((sol.payload as any)?.disciplinas ?? []).map((d: any, i: number) => {
                    const chave = `disc-${i}-${d.nome}`;
                    const ok = linhasOk.has(chave);
                    return (
                      <tr key={chave} className={`border-t ${ok ? "bg-emerald-500/5" : ""}`}>
                        <td className="p-2 text-center">
                          <input type="checkbox" checked={ok} onChange={() => toggleLinha(chave)} />
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{d.ordem ?? i + 1}</td>
                        <td className="p-2 font-medium">{d.nome}</td>
                        <td className="p-2 text-xs">{d.ch ?? "—"}h</td>
                        <td className="p-2 text-xs">{d.tipo_oferta === "C" ? t("solicitacao_detalhe.tipo_c_curto") : t("solicitacao_detalhe.tipo_a_curto")}</td>
                        <td className="p-2 text-center text-xs">{d.tem_pre_requisito ? t("comum.sim") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {t("solicitacao_detalhe.marcadas_como_ok", { ok: linhasOk.size, total: chavesLinhas.length })}
              {linhasOk.size < chavesLinhas.length && t("solicitacao_detalhe.aprovar_liberado_quando")}
            </div>
          </CardContent>
        </Card>
      )}

      <AlteracaoDeDataDetalhe sol={sol} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("solicitacao_detalhe.dados_pedido")}</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
              {JSON.stringify(sol.payload, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("solicitacao_detalhe.previa_motor")}</CardTitle>
            <CardDescription>
              {sol.previa ? t("solicitacao_detalhe.previa_desc") : t("solicitacao_detalhe.previa_vazia")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sol.previa ? (
              <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
                {JSON.stringify(sol.previa, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("solicitacao_detalhe.timeline")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            <li>{t("solicitacao_detalhe.criado_em_txt", { data: new Date(sol.criado_em).toLocaleString() })}</li>
            {sol.aprovado_em && <li>{t("solicitacao_detalhe.aprovado_em_txt", { data: new Date(sol.aprovado_em).toLocaleString() })}</li>}
            {sol.aplicado_em && <li>{t("solicitacao_detalhe.aplicado_em_txt", { data: new Date(sol.aplicado_em).toLocaleString() })}</li>}
          </ul>
        </CardContent>
      </Card>

      {rejeitando && (
        <MotivoModal
          titulo={t("solicitacao_detalhe.modal_rejeitar_titulo")}
          desc={t("solicitacao_detalhe.modal_rejeitar_desc")}
          submitLabel={t("comum.rejeitar")}
          onClose={() => setRejeitando(false)}
          onSubmit={(motivo) => aplicar.mutate({ decisao: "rejeitar", motivo_rejeicao: motivo })}
          pending={aplicar.isPending}
        />
      )}
      {devolvendo && (
        <MotivoModal
          titulo={t("solicitacao_detalhe.modal_devolver_titulo")}
          desc={t("solicitacao_detalhe.modal_devolver_desc")}
          submitLabel={t("comum.devolver")}
          onClose={() => setDevolvendo(false)}
          onSubmit={(comentario) => aplicar.mutate({ decisao: "devolver", comentario })}
          pending={aplicar.isPending}
        />
      )}
    </div>
  );
}

// Fase 7 — Analise estrutural pro aprovador
// Retorna: totalizador de CH (A10), duplicatas suspeitas (A4),
// divergencias de CH (A5). Roda so pra solicitacoes de novo_curso;
// pra outros tipos retorna null.
interface AnaliseEstrutural {
  totalizador: { ch_total: number; tipo_curso: TipoCurso | null; validacao: ReturnType<typeof validarChMinima> } | null;
  duplicatas: Array<{ novo_nome: string; similar_nome: string; score: number }>;
  divergencias: Array<{ nome: string; ch_novo: number; ch_existentes: string }>;
  compartilhadas: Array<{ nome: string; cursos: string[] }>; // A6
  ortografia: Array<{ nome: string; problema: string }>;     // A7
}

// A7 — heuristicas simples de ortografia PT-BR pra nomes de disciplinas.
// Nao substitui um corretor completo; pega os erros mais comuns:
// - Duplo espaco
// - Comeca com minuscula
// - "e"/"em"/"de" no comeco ou fim
// - Sem qualquer letra minuscula (tudo caixa alta)
// - Termina com pontuacao
// Retorna chave i18n (resolvida com t() na renderização) pra funcionar
// dentro de qualquer idioma. Chaves em solicitacao_detalhe.erro_*.
function analisarOrtografia(nome: string): string | null {
  const s = nome.trim();
  if (!s) return null;
  if (/\s{2,}/.test(s)) return "solicitacao_detalhe.erro_espaco_duplo";
  if (/[.,;:!?]$/.test(s)) return "solicitacao_detalhe.erro_pontuacao";
  if (/^(e|em|de|da|do|a|o|com)\s/i.test(s)) return "solicitacao_detalhe.erro_minuscula_inicio";
  if (s.length > 3 && s === s.toUpperCase()) return "solicitacao_detalhe.erro_caixa_alta";
  if (/^[a-z]/.test(s)) return "solicitacao_detalhe.erro_minuscula_inicio";
  return null;
}

function useAnaliseEstrutural(sol: SolicitacaoDetalhe | null | undefined): AnaliseEstrutural | null {
  const { data: disciplinasExistentes } = useQuery({
    queryKey: ["disciplinas-tenant", sol?.tenant_id],
    queryFn: async () => {
      if (!sol?.tenant_id) return [];
      const { data } = await supabase.from("disciplinas")
        .select("nome, ch, tipo_oferta, curso_id, cursos(codigo, nome)")
        .eq("tenant_id", sol.tenant_id);
      return data ?? [];
    },
    enabled: sol?.tipo === "novo_curso" && !!sol?.tenant_id,
  });

  if (!sol || sol.tipo !== "novo_curso") return null;

  const payload = (sol.payload as any) ?? {};
  const disciplinasNovas = (payload.disciplinas ?? []) as Array<{ nome: string; ch: number | null; ordem: number; tipo_oferta?: "A" | "C" }>;

  const tipo_curso = (payload.tipo_curso as TipoCurso | null) ?? null;
  const ch_total = disciplinasNovas.reduce((s, d) => s + (d.ch ?? 0), 0);
  const totalizador = tipo_curso ? {
    ch_total, tipo_curso,
    validacao: validarChMinima(tipo_curso, ch_total),
  } : null;

  // A4 — Duplicatas
  const candidatos = (disciplinasExistentes ?? []).map((d: any) => ({ item: d, nome: d.nome }));
  const duplicatas: AnaliseEstrutural["duplicatas"] = [];
  const chExistentesPorNome = new Map<string, Set<number>>();
  const cursosPorNomeDisciplina = new Map<string, string[]>();
  for (const d of disciplinasExistentes ?? []) {
    const key = d.nome.toLowerCase().trim();
    if (!chExistentesPorNome.has(key)) chExistentesPorNome.set(key, new Set());
    if (d.ch != null) chExistentesPorNome.get(key)!.add(d.ch);
    if (!cursosPorNomeDisciplina.has(key)) cursosPorNomeDisciplina.set(key, []);
    const cursoNome = (d.cursos as any)?.codigo ?? (d.cursos as any)?.nome ?? d.curso_id;
    if (cursoNome && !cursosPorNomeDisciplina.get(key)!.includes(cursoNome)) {
      cursosPorNomeDisciplina.get(key)!.push(cursoNome);
    }
  }

  for (const d of disciplinasNovas) {
    const similares = acharSimilar(d.nome, candidatos, 0.5);
    if (similares.length > 0) {
      const melhor = similares[0];
      duplicatas.push({
        novo_nome: d.nome,
        similar_nome: (melhor.item as any).nome,
        score: melhor.score,
      });
    }
  }

  // A5 — Divergencia CH
  const divergencias: AnaliseEstrutural["divergencias"] = [];
  for (const d of disciplinasNovas) {
    if (d.ch == null) continue;
    const key = d.nome.toLowerCase().trim();
    const existentesCH = chExistentesPorNome.get(key);
    if (existentesCH && existentesCH.size > 0 && !existentesCH.has(d.ch)) {
      divergencias.push({
        nome: d.nome,
        ch_novo: d.ch,
        ch_existentes: Array.from(existentesCH).join("h, ") + "h",
      });
    }
  }

  // A6 — Compartilhamento descasado: disciplina 'C' (compartilhada) que
  // ja existe em outros cursos. Nao verificamos datas em `calendario_linhas`
  // ainda (complexo); mostramos o alerta pro aprovador conferir manualmente
  // as datas ali no calendario antes de aprovar.
  const compartilhadas: AnaliseEstrutural["compartilhadas"] = [];
  for (const d of disciplinasNovas) {
    if (d.tipo_oferta !== "C") continue;
    const key = d.nome.toLowerCase().trim();
    const cursosOndeExiste = cursosPorNomeDisciplina.get(key) ?? [];
    if (cursosOndeExiste.length > 0) {
      compartilhadas.push({ nome: d.nome, cursos: cursosOndeExiste });
    }
  }

  // A7 — Ortografia
  const ortografia: AnaliseEstrutural["ortografia"] = [];
  for (const d of disciplinasNovas) {
    const problema = analisarOrtografia(d.nome);
    if (problema) ortografia.push({ nome: d.nome, problema });
  }

  return { totalizador, duplicatas, divergencias, compartilhadas, ortografia };
}

function MotivoModal({ titulo, desc, submitLabel, onClose, onSubmit, pending }: {
  titulo: string; desc: string; submitLabel: string;
  onClose: () => void; onSubmit: (v: string) => void; pending: boolean;
}) {
  const [valor, setValor] = useState("");
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        <Textarea value={valor} onChange={(e) => setValor(e.target.value)} rows={4} placeholder="Motivo / comentário…" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button variant="destructive" onClick={() => onSubmit(valor.trim())} disabled={pending || !valor.trim()}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Fase 8 — Rendering estruturado dos 4 subtipos de alteração de data.
// Mostra: turma alvo, campo alterado (data atual → nova), motivo em
// destaque. Só aparece pros subtipos alterar_data_*; outros tipos caem
// no bloco genérico "Dados do pedido" (JSON cru).
function AlteracaoDeDataDetalhe({ sol }: { sol: SolicitacaoDetalhe }) {
  const SUBTIPOS = new Set([
    "alterar_data_live",
    "alterar_data_termino",
    "alterar_data_correcao",
    "alterar_data_inicio",
  ]);
  if (!SUBTIPOS.has(sol.tipo)) return null;

  const payload = (sol.payload ?? {}) as {
    chave_natural?: string;
    campo?: string;
    nova_data?: string;
    motivo?: string;
    propagar_seguintes?: boolean;
  };

  return <AlteracaoDeDataDetalheCard sol={sol} payload={payload} />;
}

function AlteracaoDeDataDetalheCard({
  sol,
  payload,
}: {
  sol: SolicitacaoDetalhe;
  payload: {
    chave_natural?: string;
    campo?: string;
    nova_data?: string;
    motivo?: string;
    propagar_seguintes?: boolean;
  };
}) {
  const { t } = useT();
  const { data: linha } = useQuery({
    queryKey: ["calendario-linha-alvo", sol.tenant_id, payload.chave_natural],
    queryFn: async () => {
      if (!payload.chave_natural) return null;
      const { data } = await supabase
        .from("calendario_linhas")
        .select("dados")
        .eq("tenant_id", sol.tenant_id)
        .eq("chave_natural", payload.chave_natural)
        .maybeSingle();
      return data;
    },
    enabled: !!payload.chave_natural,
  });

  const dados = (linha?.dados ?? {}) as Record<string, unknown>;
  const codigo = String(dados["CÓDIGO DA TURMA "] ?? dados["CÓDIGO DA TURMA"] ?? "—");
  const disciplina = String(dados["DISCIPLINA"] ?? "");
  const curso = String(dados["CURSO"] ?? "");
  const inicio = (dados["DATA  INÍCIO"] ?? dados["DATA INÍCIO"] ?? null) as string | null;
  const fim = (dados["DATA FIM "] ?? dados["DATA FIM"] ?? null) as string | null;
  const valorAtual = payload.campo ? (dados[payload.campo] as string | null) : null;

  const foraDeJanela =
    sol.tipo === "alterar_data_live" && !!(inicio && fim && payload.nova_data) &&
    (payload.nova_data < inicio || payload.nova_data > fim);

  const titulos: Record<string, string> = {
    alterar_data_live: t("solicitacao_detalhe.titulo_live"),
    alterar_data_termino: t("solicitacao_detalhe.titulo_termino"),
    alterar_data_correcao: t("solicitacao_detalhe.titulo_correcao"),
    alterar_data_inicio: t("solicitacao_detalhe.titulo_inicio"),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulos[sol.tipo]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono">{codigo}</span>
            <span className="text-muted-foreground">{t("calendario.ano")} {sol.ano ?? "—"}</span>
          </div>
          <div className="mt-1 text-sm font-medium">{disciplina}</div>
          <div className="text-xs text-muted-foreground">{curso}</div>
          {inicio && fim && (
            <div className="mt-2 text-xs text-muted-foreground">
              {t("solicitacao_nova.periodo_disciplina", { inicio, fim })}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("solicitacao_detalhe.campo")}</div>
            <div className="mt-0.5 text-sm">{payload.campo ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("solicitacao_detalhe.alteracao")}</div>
            <div className="mt-0.5 text-sm">
              <span className="text-muted-foreground line-through">{valorAtual ?? t("solicitacao_detalhe.sem_data")}</span>
              <span className="mx-2">→</span>
              <span className="font-medium">{payload.nova_data ?? "—"}</span>
            </div>
          </div>
        </div>

        {foraDeJanela && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">{t("solicitacao_detalhe.fora_do_periodo")}</span> {t("solicitacao_detalhe.fora_do_periodo_aviso")}
            </div>
          </div>
        )}
        {!foraDeJanela && sol.tipo === "alterar_data_live" && payload.nova_data && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{t("solicitacao_detalhe.dentro_do_periodo")}</div>
          </div>
        )}
        {sol.tipo === "alterar_data_termino" && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            {t("solicitacao_detalhe.aviso_atividade_ao_aplicar")}
          </div>
        )}
        {sol.tipo === "alterar_data_inicio" && payload.propagar_seguintes && (
          <div className="flex items-start gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs text-orange-800 dark:text-orange-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">{t("solicitacao_detalhe.propagar_sim")}</span> {t("solicitacao_detalhe.propagar_sim_aviso")}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Motivo</div>
          <div className="mt-1 rounded-md border bg-background p-3 text-sm">
            {payload.motivo?.trim() ? payload.motivo : <span className="text-muted-foreground">{t("solicitacao_detalhe.sem_motivo")}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
