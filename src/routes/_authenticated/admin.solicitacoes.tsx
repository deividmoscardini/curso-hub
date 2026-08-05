import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/solicitacoes")({
  head: () => ({ meta: [{ title: "Solicitações — Admin" }] }),
  component: AdminSolicitacoesPage,
});

type StatusSolicitacao = "pendente" | "em_revisao" | "aprovada" | "aplicada" | "rejeitada" | "devolvida";
type TipoSolicitacao = "gerar_ano" | "nova_oferta" | "ajuste_ancora" | "ajuste_manual" | "cancelar_oferta" | "novo_curso" | "reordenar_carrossel";

interface SolicitacaoRow {
  id: string;
  tenant_id: string;
  solicitante_id: string;
  tipo: TipoSolicitacao;
  aba: string | null;
  ano: number | null;
  status: StatusSolicitacao;
  criado_em: string;
  aprovado_em: string | null;
  aplicado_em: string | null;
  tenants: { nome: string } | null;
  solicitante: { nome: string; email: string } | null;
}

const STATUS_LABEL: Record<StatusSolicitacao, string> = {
  pendente: "Pendente", em_revisao: "Em revisão", aprovada: "Aprovada",
  aplicada: "Aplicada", rejeitada: "Rejeitada", devolvida: "Devolvida",
};
const STATUS_CLS: Record<StatusSolicitacao, string> = {
  pendente: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  em_revisao: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  aprovada: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  aplicada: "bg-emerald-600/20 text-emerald-800 dark:text-emerald-300",
  rejeitada: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  devolvida: "bg-slate-500/10 text-slate-700 dark:text-slate-400",
};

function AdminSolicitacoesPage() {
  const { perfil } = useTenant();
  const [statusFiltro, setStatusFiltro] = useState<StatusSolicitacao | "">("");
  const [tipoFiltro, setTipoFiltro] = useState<TipoSolicitacao | "">("");

  const { data: solicitacoes } = useQuery({
    queryKey: ["admin-solicitacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes")
        .select(`
          id, tenant_id, solicitante_id, tipo, aba, ano, status,
          criado_em, aprovado_em, aplicado_em,
          tenants(nome),
          solicitante:solicitante_id(nome, email)
        `)
        .order("criado_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as SolicitacaoRow[];
    },
    enabled: !!perfil?.admin_global,
  });

  const filtradas = useMemo(() => {
    let s = solicitacoes ?? [];
    if (statusFiltro) s = s.filter((r) => r.status === statusFiltro);
    if (tipoFiltro) s = s.filter((r) => r.tipo === tipoFiltro);
    return s;
  }, [solicitacoes, statusFiltro, tipoFiltro]);

  const contagens = useMemo(() => {
    const c: Record<StatusSolicitacao, number> = {
      pendente: 0, em_revisao: 0, aprovada: 0, aplicada: 0, rejeitada: 0, devolvida: 0,
    };
    for (const s of solicitacoes ?? []) c[s.status]++;
    return c;
  }, [solicitacoes]);

  if (!perfil?.admin_global) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Só admin global.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Solicitações</h1>
        <p className="text-sm text-muted-foreground">
          Fila global — todos os pedidos de todos os produtos, com histórico completo.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        {(Object.keys(STATUS_LABEL) as StatusSolicitacao[]).map((s) => (
          <Card key={s} className={statusFiltro === s ? "border-primary" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{contagens[s]}</div>
              <Button
                variant="link" size="sm" className="h-auto p-0 text-xs"
                onClick={() => setStatusFiltro(statusFiltro === s ? "" : s)}
              >
                {statusFiltro === s ? "limpar filtro" : "filtrar"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value as TipoSolicitacao | "")}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Todos os tipos</option>
          <option value="novo_curso">Novo curso</option>
          <option value="ajuste_ancora">Alteração de datas (âncora)</option>
          <option value="ajuste_manual">Alteração de datas (célula)</option>
          <option value="reordenar_carrossel">Reordenar disciplinas</option>
          <option value="nova_oferta">Nova oferta</option>
          <option value="cancelar_oferta">Cancelar oferta</option>
          <option value="gerar_ano">Gerar ano</option>
        </select>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtradas.length.toLocaleString("pt-BR")} solicitações
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Data</th>
                  <th className="p-2">Solicitante</th>
                  <th className="p-2">Produto</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Ano</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Aprovado em</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">Nenhuma solicitação encontrada.</td></tr>
                ) : filtradas.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-muted/20">
                    <td className="p-2 text-xs">{new Date(s.criado_em).toLocaleString("pt-BR")}</td>
                    <td className="p-2 text-xs">
                      <div className="font-medium">{s.solicitante?.nome ?? "?"}</div>
                      <div className="text-[10px] text-muted-foreground">{s.solicitante?.email}</div>
                    </td>
                    <td className="p-2 text-xs">{s.tenants?.nome ?? "—"}</td>
                    <td className="p-2 text-xs capitalize">{s.tipo.replace(/_/g, " ")}</td>
                    <td className="p-2 text-xs">{s.ano ?? "—"}</td>
                    <td className="p-2">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLS[s.status]}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {s.aprovado_em ? new Date(s.aprovado_em).toLocaleDateString("pt-BR") : "—"}
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
    </div>
  );
}
