// Fase 8 — CRUD administrativo direto sobre calendario_linhas.
// Só admin_global. Cenários que estão FORA do fluxo automatizado
// (prova substitutiva, fechamento, cancelar oferta, correções pontuais)
// resolvem por aqui. Toda operação exige motivo obrigatório e grava
// log_auditoria + push em `comentarios` (edit).

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Pencil, ArrowLeft } from "lucide-react";
import { CalendarioEditModal, type LinhaEditavel } from "@/components/CalendarioEditModal";

export const Route = createFileRoute("/_authenticated/admin/calendario")({
  head: () => ({ meta: [{ title: "Calendário — Admin" }] }),
  component: AdminCalendarioPage,
});

type Aba = "disciplinas" | "projeto_aplicacao" | "prova_substitutiva" | "fechamento";

const ABA_LABEL: Record<Aba, string> = {
  disciplinas: "Disciplinas",
  projeto_aplicacao: "Projeto de Aplicação",
  prova_substitutiva: "Prova Substitutiva",
  fechamento: "Fechamento de turmas",
};

function AdminCalendarioPage() {
  const { tenantId, perfil } = useTenant();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("disciplinas");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<LinhaEditavel | null>(null);

  if (!perfil?.admin_global) {
    return (
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">
        Só administradores globais podem acessar essa tela.
      </CardContent></Card>
    );
  }
  if (!tenantId) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Selecione um produto no menu lateral.</CardContent></Card>;
  }

  const { data: linhas, isLoading } = useQuery({
    queryKey: ["admin-calendario", tenantId, aba],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendario_linhas")
        .select("id, tenant_id, aba, ano, ordem, chave_natural, dados, comentarios")
        .eq("tenant_id", tenantId)
        .eq("aba", aba)
        .order("ano", { ascending: true })
        .order("ordem", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as LinhaEditavel[];
    },
  });

  const filtradas = useMemo(() => {
    if (!linhas) return [];
    if (!busca.trim()) return linhas;
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      const blob = JSON.stringify(l.dados).toLowerCase();
      return blob.includes(q) || l.chave_natural.toLowerCase().includes(q);
    });
  }, [linhas, busca]);

  const colunas = useMemo(() => {
    if (!linhas || linhas.length === 0) return [];
    return Object.keys(linhas[0].dados ?? {}).slice(0, 6);
  }, [linhas]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/calendario"><ArrowLeft className="mr-1 h-4 w-4" />Calendário público</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendário — modo admin</h1>
        <p className="text-sm text-muted-foreground">
          Edite ou exclua linhas direto pra cenários que estão fora do fluxo de solicitação (prova
          substitutiva, fechamento, cancelamento de oferta). Motivo é sempre obrigatório e fica
          registrado no calendário público.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Alterações feitas aqui <span className="font-medium">não passam pelo fluxo de aprovação</span>. Use com
          cuidado — cada alteração aparece no histórico da linha (badge no calendário público) com o
          seu nome.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList>
            {(["disciplinas", "projeto_aplicacao", "prova_substitutiva", "fechamento"] as const).map((a) => (
              <TabsTrigger key={a} value={a}>{ABA_LABEL[a]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, curso, disciplina…" className="max-w-sm" />
      </div>

      {isLoading ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>
      ) : filtradas.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Sem linhas nessa aba.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Chave</th>
                {colunas.map((c) => (<th key={c} className="p-2">{c}</th>))}
                <th className="p-2">Histórico</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 200).map((l) => {
                const eventos = Array.isArray(l.comentarios) ? l.comentarios : [];
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/20">
                    <td className="p-2 font-mono text-xs">{l.chave_natural}</td>
                    {colunas.map((c) => (
                      <td key={c} className="p-2 max-w-[200px] truncate">
                        {(() => {
                          const v = (l.dados as Record<string, unknown>)[c];
                          if (v == null) return "—";
                          if (typeof v === "string" || typeof v === "number") return String(v);
                          return JSON.stringify(v);
                        })()}
                      </td>
                    ))}
                    <td className="p-2">
                      {eventos.length > 0 && (
                        <Badge variant="secondary">{eventos.length}</Badge>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditando(l)}>
                        <Pencil className="mr-1 h-3 w-3" />Editar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtradas.length > 200 && (
            <div className="border-t bg-muted/20 p-2 text-center text-xs text-muted-foreground">
              Mostrando primeiras 200 de {filtradas.length.toLocaleString("pt-BR")} linhas.
            </div>
          )}
        </div>
      )}

      {editando && (
        <CalendarioEditModal
          linha={editando}
          onClose={() => setEditando(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["admin-calendario"] })}
        />
      )}
    </div>
  );
}
