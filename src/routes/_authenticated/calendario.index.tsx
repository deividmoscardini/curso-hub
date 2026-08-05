import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CalendarDays, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calendario/")({
  head: () => ({
    meta: [{ title: "Calendário — Calendário +A" }],
  }),
  component: CalendarioPage,
});

type Aba = "disciplinas" | "projeto_aplicacao" | "prova_substitutiva" | "fechamento";

interface Linha {
  id: string;
  aba: Aba;
  ano: number;
  ordem: number;
  chave_natural: string;
  dados: Record<string, unknown>;
  conflitos: Record<string, string>;
  curso_id: string | null;
}

const ABA_LABEL: Record<Aba, string> = {
  disciplinas: "Disciplinas",
  projeto_aplicacao: "Projeto de Aplicação",
  prova_substitutiva: "Prova Substitutiva",
  fechamento: "Fechamento de turmas",
};

function CalendarioPage() {
  const { tenantId, tenants, loading } = useTenant();
  const [aba, setAba] = useState<Aba>("disciplinas");
  const [busca, setBusca] = useState("");
  const [anoFiltro, setAnoFiltro] = useState<string>("");

  const { data: linhas, isLoading } = useQuery({
    queryKey: ["calendario", tenantId, aba],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("calendario_linhas")
        .select("id, aba, ano, ordem, chave_natural, dados, conflitos, curso_id")
        .eq("tenant_id", tenantId)
        .eq("aba", aba)
        .order("ano", { ascending: true })
        .order("ordem", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
    enabled: !!tenantId,
  });

  const { data: totais } = useQuery({
    queryKey: ["calendario-totais", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const abas: Aba[] = ["disciplinas", "projeto_aplicacao", "prova_substitutiva", "fechamento"];
      const results = await Promise.all(
        abas.map(async (a) => {
          const { count } = await supabase
            .from("calendario_linhas")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("aba", a);
          return [a, count ?? 0] as const;
        })
      );
      return Object.fromEntries(results) as Record<Aba, number>;
    },
    enabled: !!tenantId,
  });

  const anos = useMemo(() => {
    const set = new Set((linhas ?? []).map((l) => l.ano));
    return Array.from(set).sort((a, b) => a - b);
  }, [linhas]);

  const filtradas = useMemo(() => {
    let l = linhas ?? [];
    if (anoFiltro) l = l.filter((r) => String(r.ano) === anoFiltro);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      l = l.filter((r) => JSON.stringify(r.dados).toLowerCase().includes(q));
    }
    return l;
  }, [linhas, anoFiltro, busca]);

  const colunas = useMemo(() => {
    if (!filtradas.length) return [];
    const primeiraDados = filtradas[0].dados;
    return Object.keys(primeiraDados).slice(0, 8);
  }, [filtradas]);

  if (loading) {
    return (
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>
    );
  }
  if (tenants.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Você ainda não é membro de nenhum produto. Peça a um administrador da +A pra ser adicionado.
        </CardContent>
      </Card>
    );
  }
  if (!tenantId) {
    return (
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">Selecione um produto no menu lateral…</CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendário</h1>
          <p className="text-sm text-muted-foreground">
            Visão viva do calendário do produto selecionado.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {(Object.keys(ABA_LABEL) as Aba[]).map((a) => (
          <Card key={a} className={aba === a ? "border-primary" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">{ABA_LABEL[a]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {(totais?.[a] ?? 0).toLocaleString("pt-BR")}
              </div>
              <div className="text-[10px] text-muted-foreground">linhas</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <TabsList>
          {(Object.keys(ABA_LABEL) as Aba[]).map((a) => (
            <TabsTrigger key={a} value={a}>{ABA_LABEL[a]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={anoFiltro}
          onChange={(e) => setAnoFiltro(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Todos os anos</option>
          {anos.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtradas.length.toLocaleString("pt-BR")} linhas
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>
      ) : filtradas.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            <CalendarDays className="mx-auto mb-2 h-8 w-8 opacity-50" />
            Nenhuma linha nesta aba. Importe a planilha em <a href="/produtos" className="underline">Produtos</a>.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Ano</th>
                <th className="p-2">Ordem</th>
                {colunas.map((c) => (
                  <th key={c} className="p-2">{c}</th>
                ))}
                <th className="p-2">Conflitos</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 200).map((l) => (
                <tr key={l.id} className="border-t hover:bg-muted/20">
                  <td className="p-2 font-medium">{l.ano}</td>
                  <td className="p-2">{l.ordem}</td>
                  {colunas.map((c) => (
                    <td key={c} className="p-2 max-w-[200px] truncate">
                      {formatarCelula(l.dados[c])}
                    </td>
                  ))}
                  <td className="p-2">
                    {Object.keys(l.conflitos ?? {}).length > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {Object.keys(l.conflitos).length}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtradas.length > 200 && (
            <div className="border-t bg-muted/20 p-2 text-center text-xs text-muted-foreground">
              Mostrando primeiras 200 de {filtradas.length.toLocaleString("pt-BR")} linhas.
              Refine os filtros pra ver mais.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatarCelula(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}
