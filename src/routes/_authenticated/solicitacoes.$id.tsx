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
import { ArrowLeft, Loader2, Check, X, RotateCcw } from "lucide-react";

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
