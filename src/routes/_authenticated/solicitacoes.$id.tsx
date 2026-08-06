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
  const [rejeitando, setRejeitando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);

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
      if (!resp.ok || json.error) throw new Error(json.error ?? "Erro");
      return json;
    },
    onSuccess: (r) => {
      toast.success(`Solicitação ${r.status}`);
      qc.invalidateQueries();
      setRejeitando(false); setDevolvendo(false);
    },
    onError: (err: Error) => toast.error("Falha", { description: err.message }),
  });

  // Fase 7 — Analises estruturais visiveis ao aprovador (so em novo_curso)
  const analise = useAnaliseEstrutural(sol);

  if (!sol) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/solicitacoes" })}>
          <ArrowLeft className="mr-1 h-4 w-4" />Voltar
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight capitalize">{sol.tipo.replace(/_/g, " ")}</h1>
            <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLS[sol.status] ?? ""}`}>
              {STATUS_LABEL[sol.status] ?? sol.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {sol.tenants?.nome} · pedido por {sol.solicitante?.nome} em {new Date(sol.criado_em).toLocaleString("pt-BR")}
          </p>
        </div>
        {podeDecidir && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDevolvendo(true)}>
              <RotateCcw className="mr-1 h-4 w-4" />Devolver
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRejeitando(true)}>
              <X className="mr-1 h-4 w-4" />Rejeitar
            </Button>
            <Button size="sm" onClick={() => aplicar.mutate({ decisao: "aprovar" })} disabled={aplicar.isPending}>
              {aplicar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Aprovar
            </Button>
          </div>
        )}
      </div>

      {sol.motivo_rejeicao && (
        <Card className="border-rose-500/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Motivo da rejeição</CardTitle></CardHeader>
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
                  Carga horária total: {analise.totalizador.ch_total}h
                  {analise.totalizador.validacao.ch_minima > 0 && (
                    <span className="text-muted-foreground"> / mínimo {analise.totalizador.validacao.ch_minima}h</span>
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
              <Copy className="h-4 w-4" />Possíveis duplicatas ({analise.duplicatas.length})
            </CardTitle>
            <CardDescription>Estas disciplinas parecem já existir. Considere reusar em vez de duplicar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analise.duplicatas.map((d, i) => (
              <div key={i} className="text-xs">
                <div><span className="font-medium">"{d.novo_nome}"</span> — sugestão: reusar <span className="font-mono">{d.similar_nome}</span> ({Math.round(d.score * 100)}% similar)</div>
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
              <AlertTriangle className="h-4 w-4" />Divergência de carga horária ({analise.divergencias.length})
            </CardTitle>
            <CardDescription>Disciplinas com mesmo nome têm CH diferente em outros cursos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analise.divergencias.map((d, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">"{d.nome}"</span>: aqui {d.ch_novo}h, mas outros cursos usam {d.ch_existentes}h.
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do pedido</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
              {JSON.stringify(sol.payload, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prévia do motor</CardTitle>
            <CardDescription>
              {sol.previa ? "Linhas calculadas antes de aplicar." : "Sem prévia calculada (esse tipo pode não gerar prévia via motor)."}
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
        <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            <li>📩 Criado em {new Date(sol.criado_em).toLocaleString("pt-BR")}</li>
            {sol.aprovado_em && <li>✅ Aprovado em {new Date(sol.aprovado_em).toLocaleString("pt-BR")}</li>}
            {sol.aplicado_em && <li>✔️ Aplicado em {new Date(sol.aplicado_em).toLocaleString("pt-BR")}</li>}
          </ul>
        </CardContent>
      </Card>

      {rejeitando && (
        <MotivoModal
          titulo="Rejeitar solicitação"
          desc="Explique por que está rejeitando. O solicitante verá o motivo."
          submitLabel="Rejeitar"
          onClose={() => setRejeitando(false)}
          onSubmit={(motivo) => aplicar.mutate({ decisao: "rejeitar", motivo_rejeicao: motivo })}
          pending={aplicar.isPending}
        />
      )}
      {devolvendo && (
        <MotivoModal
          titulo="Devolver ao solicitante"
          desc="Deixe um comentário pedindo ajuste. O solicitante poderá editar e reenviar."
          submitLabel="Devolver"
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
}

function useAnaliseEstrutural(sol: SolicitacaoDetalhe | null | undefined): AnaliseEstrutural | null {
  const { data: disciplinasExistentes } = useQuery({
    queryKey: ["disciplinas-tenant", sol?.tenant_id],
    queryFn: async () => {
      if (!sol?.tenant_id) return [];
      const { data } = await supabase.from("disciplinas")
        .select("nome, ch, curso_id")
        .eq("tenant_id", sol.tenant_id);
      return data ?? [];
    },
    enabled: sol?.tipo === "novo_curso" && !!sol?.tenant_id,
  });

  if (!sol || sol.tipo !== "novo_curso") return null;

  const payload = (sol.payload as any) ?? {};
  const disciplinasNovas = (payload.disciplinas ?? []) as Array<{ nome: string; ch: number | null; ordem: number }>;

  const tipo_curso = (payload.tipo_curso as TipoCurso | null) ?? null;
  const ch_total = disciplinasNovas.reduce((s, d) => s + (d.ch ?? 0), 0);
  const totalizador = tipo_curso ? {
    ch_total, tipo_curso,
    validacao: validarChMinima(tipo_curso, ch_total),
  } : null;

  // A4 — Duplicatas: cada disciplina nova comparada contra as existentes
  const candidatos = (disciplinasExistentes ?? []).map((d: any) => ({ item: d, nome: d.nome }));
  const duplicatas: AnaliseEstrutural["duplicatas"] = [];
  const chExistentesPorNome = new Map<string, Set<number>>();
  for (const d of disciplinasExistentes ?? []) {
    const key = d.nome.toLowerCase().trim();
    if (!chExistentesPorNome.has(key)) chExistentesPorNome.set(key, new Set());
    if (d.ch != null) chExistentesPorNome.get(key)!.add(d.ch);
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

  return { totalizador, duplicatas, divergencias };
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
