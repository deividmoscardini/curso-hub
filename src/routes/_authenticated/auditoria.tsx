import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Calendário +A" }] }),
  component: AuditoriaPage,
});

interface LogRow {
  id: string;
  tenant_id: string | null;
  ator_id: string | null;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  antes: unknown;
  depois: unknown;
  motivo: string | null;
  criado_em: string;
  ator: { nome: string; email: string } | null;
  tenants: { nome: string } | null;
}

function AuditoriaPage() {
  const { perfil } = useTenant();
  const [filtroAcao, setFiltroAcao] = useState("");
  const [filtroEntidade, setFiltroEntidade] = useState<string>("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["auditoria"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("log_auditoria")
        .select(`
          id, tenant_id, ator_id, acao, entidade, entidade_id,
          antes, depois, motivo, criado_em,
          ator:ator_id(nome, email),
          tenants(nome)
        `)
        .order("criado_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as LogRow[];
    },
    enabled: !!perfil,
  });

  const acoesDisponiveis = useMemo(() => {
    const set = new Set((logs ?? []).map((l) => l.acao));
    return Array.from(set).sort();
  }, [logs]);

  const entidadesDisponiveis = useMemo(() => {
    const set = new Set((logs ?? []).map((l) => l.entidade).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [logs]);

  const filtrados = useMemo(() => {
    let ls = logs ?? [];
    if (filtroAcao) ls = ls.filter((l) => l.acao === filtroAcao);
    if (filtroEntidade) ls = ls.filter((l) => l.entidade === filtroEntidade);
    return ls;
  }, [logs, filtroAcao, filtroEntidade]);

  if (!perfil?.admin_global) {
    return (
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">
        Só admin global vê o log completo. Owner de produto pode ver o do seu tenant em breve.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Histórico completo de todas as ações registradas na plataforma.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm">
          <option value="">Todas as ações ({(logs ?? []).length})</option>
          {acoesDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtroEntidade} onChange={(e) => setFiltroEntidade(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm">
          <option value="">Todas as entidades</option>
          {entidadesDisponiveis.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtrados.length.toLocaleString("pt-BR")} registros
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>
      ) : filtrados.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Nenhum registro com esses filtros.
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2">Data/hora</th>
                    <th className="p-2">Ator</th>
                    <th className="p-2">Ação</th>
                    <th className="p-2">Entidade</th>
                    <th className="p-2">Produto</th>
                    <th className="p-2">Motivo/Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/20">
                      <td className="p-2 text-xs">{new Date(l.criado_em).toLocaleString("pt-BR")}</td>
                      <td className="p-2 text-xs">
                        {l.ator ? (
                          <>
                            <div className="font-medium">{l.ator.nome}</div>
                            <div className="text-[10px] text-muted-foreground">{l.ator.email}</div>
                          </>
                        ) : <span className="text-muted-foreground">sistema</span>}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="font-mono text-[10px]">{l.acao}</Badge>
                      </td>
                      <td className="p-2 text-xs">
                        {l.entidade ?? "—"}
                        {l.entidade_id && <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{l.entidade_id.slice(0, 8)}…</div>}
                      </td>
                      <td className="p-2 text-xs">{l.tenants?.nome ?? "—"}</td>
                      <td className="p-2 text-xs max-w-md">
                        {l.motivo ? (
                          <div className="truncate">{l.motivo}</div>
                        ) : l.depois ? (
                          <details>
                            <summary className="cursor-pointer text-muted-foreground">detalhes</summary>
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/40 p-1 text-[10px]">{JSON.stringify(l.depois, null, 2)}</pre>
                          </details>
                        ) : "—"}
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
