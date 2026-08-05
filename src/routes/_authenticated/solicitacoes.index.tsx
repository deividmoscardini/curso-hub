import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solicitacoes/")({
  head: () => ({ meta: [{ title: "Solicitações — Calendário +A" }] }),
  component: SolicitacoesListaPage,
});

interface SolicitacaoRow {
  id: string;
  tenant_id: string;
  tipo: string;
  aba: string | null;
  ano: number | null;
  status: string;
  criado_em: string;
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

function SolicitacoesListaPage() {
  const { tenantId } = useTenant();

  const { data: solicitacoes } = useQuery({
    queryKey: ["solicitacoes-lista", tenantId],
    queryFn: async () => {
      let q = supabase
        .from("solicitacoes")
        .select(`id, tenant_id, tipo, aba, ano, status, criado_em, solicitante:solicitante_id(nome, email)`)
        .order("criado_em", { ascending: false })
        .limit(200);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SolicitacaoRow[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Solicitações</h1>
          <p className="text-sm text-muted-foreground">
            RLS filtra automaticamente: você vê suas solicitações; aprovadores veem todas do produto.
          </p>
        </div>
        <Button asChild>
          <Link to="/solicitacoes/nova">
            <Plus className="mr-2 h-4 w-4" />Nova solicitação
          </Link>
        </Button>
      </div>

      {(solicitacoes?.length ?? 0) === 0 ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
          <Inbox className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhuma solicitação ainda. Clique em "Nova solicitação" pra abrir a primeira.
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2">Data</th>
                    <th className="p-2">Solicitante</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Aba</th>
                    <th className="p-2">Ano</th>
                    <th className="p-2">Status</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {solicitacoes?.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/20">
                      <td className="p-2 text-xs">{new Date(s.criado_em).toLocaleString("pt-BR")}</td>
                      <td className="p-2 text-xs">{s.solicitante?.nome ?? "—"}</td>
                      <td className="p-2 text-xs capitalize">{s.tipo.replace(/_/g, " ")}</td>
                      <td className="p-2 text-xs">{s.aba ?? "—"}</td>
                      <td className="p-2 text-xs">{s.ano ?? "—"}</td>
                      <td className="p-2">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLS[s.status] ?? ""}`}>
                          {STATUS_LABEL[s.status] ?? s.status}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/solicitacoes/$id" params={{ id: s.id }}>Ver</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
