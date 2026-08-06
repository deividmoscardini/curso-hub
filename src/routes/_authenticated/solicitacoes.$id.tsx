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
  // A8 — Para novo_curso, extrai chaves das disciplinas pra checar se
  // todas foram marcadas como OK antes de habilitar o botao "Aprovar".
  const chavesLinhas = (sol && sol.tipo === "novo_curso")
    ? ((sol.payload as any)?.disciplinas ?? []).map((d: any, i: number) => `disc-${i}-${d.nome}`)
    : [];
  const todasLinhasOk = chavesLinhas.length === 0 || chavesLinhas.every((c: string) => linhasOk.has(c));

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
            <Button
              size="sm"
              onClick={() => aplicar.mutate({ decisao: "aprovar" })}
              disabled={aplicar.isPending || !todasLinhasOk}
              title={!todasLinhasOk ? "Marque todas as linhas como OK antes de aprovar" : undefined}
            >
              {aplicar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Aprovar {chavesLinhas.length > 0 && `(${linhasOk.size}/${chavesLinhas.length})`}
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

      {/* A6 — Compartilhamento (disciplina C que já existe em outros cursos) */}
      {analise?.compartilhadas && analise.compartilhadas.length > 0 && (
        <Card className="border-sky-500/40 bg-sky-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-sky-800 dark:text-sky-300">
              <AlertTriangle className="h-4 w-4" />Disciplinas compartilhadas ({analise.compartilhadas.length})
            </CardTitle>
            <CardDescription>Estas disciplinas estão marcadas como compartilhadas (tipo C) e já existem em outros cursos. Confira no calendário se as datas de oferta batem antes de aprovar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analise.compartilhadas.map((c, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">"{c.nome}"</span> — já em: {c.cursos.slice(0, 5).join(", ")}{c.cursos.length > 5 && ` + ${c.cursos.length - 5} outros`}
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
              <AlertTriangle className="h-4 w-4" />Revisão ortográfica ({analise.ortografia.length})
            </CardTitle>
            <CardDescription>Nomes com formatação incomum. Não bloqueia, é só um ping pro revisor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analise.ortografia.map((o, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">"{o.nome}"</span> — {o.problema}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* A8 — Aprovacao por linha (novo_curso): tabela com checkbox por disciplina */}
      {sol.tipo === "novo_curso" && chavesLinhas.length > 0 && podeDecidir && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Disciplinas do curso ({chavesLinhas.length})</CardTitle>
            <CardDescription>
              Revise cada linha e marque como OK antes de aprovar. Se algo estiver errado, use "Devolver" com um comentário pro solicitante ajustar.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-16 p-2 text-center">OK?</th>
                    <th className="w-10 p-2">#</th>
                    <th className="p-2">Disciplina</th>
                    <th className="w-16 p-2">CH</th>
                    <th className="w-20 p-2">Tipo</th>
                    <th className="w-24 p-2 text-center">Pré-req</th>
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
                        <td className="p-2 text-xs">{d.tipo_oferta === "C" ? "Compartilhada" : "Exclusiva"}</td>
                        <td className="p-2 text-center text-xs">{d.tem_pre_requisito ? "Sim" : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {linhasOk.size} de {chavesLinhas.length} marcadas como OK.
              {linhasOk.size < chavesLinhas.length && " Aprovar só habilita quando todas estiverem marcadas."}
            </div>
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
function analisarOrtografia(nome: string): string | null {
  const t = nome.trim();
  if (!t) return null;
  if (/\s{2,}/.test(t)) return "Espaco duplo — remova espacos extras";
  if (/[.,;:!?]$/.test(t)) return "Termina com pontuacao — remova";
  if (/^(e|em|de|da|do|a|o|com)\s/i.test(t)) return `Comeca com "${t.split(" ")[0]}" — verifique se e intencional`;
  if (t.length > 3 && t === t.toUpperCase()) return "Todo em maiuscula — considere caixa mista";
  if (/^[a-z]/.test(t)) return "Comeca com minuscula — capitalize a primeira letra";
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
