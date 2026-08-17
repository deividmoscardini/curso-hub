import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CalendarDays, AlertTriangle, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/contexts/i18n";
import { colunasParaExibir, labelColuna, type AbaCalendario } from "@/lib/colunas-calendario";

export const Route = createFileRoute("/_authenticated/calendario/")({
  head: () => ({
    meta: [{ title: "Calendário — Calendário +A" }],
  }),
  component: CalendarioPage,
});

type Aba = "disciplinas" | "projeto_aplicacao" | "prova_substitutiva" | "fechamento";

interface EventoComentario {
  criado_em: string;
  autor_id: string;
  motivo: string;
  solicitacao_id?: string;
  tipo?: "alteracao_solicitacao" | "admin_edit" | "admin_delete";
  campo_alterado?: string;
  valor_anterior?: unknown;
  valor_novo?: unknown;
}

interface Linha {
  id: string;
  aba: Aba;
  ano: number;
  ordem: number;
  chave_natural: string;
  dados: Record<string, unknown>;
  conflitos: Record<string, string>;
  comentarios: EventoComentario[];
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
  const { t } = useT();
  const ABA_LABEL_LOCAL: Record<Aba, string> = {
    disciplinas: t("calendario.aba_disciplinas"),
    projeto_aplicacao: t("calendario.aba_projeto_aplicacao"),
    prova_substitutiva: t("calendario.aba_prova_substitutiva"),
    fechamento: t("calendario.aba_fechamento"),
  };
  const [aba, setAba] = useState<Aba>("disciplinas");
  const [busca, setBusca] = useState("");
  const [anoFiltro, setAnoFiltro] = useState<string>("");
  // Fase 11.7 — Filtros por coluna. Chave = nome exato da coluna (com
  // quirks do Excel), valor = texto de filtro. Case-insensitive contains.
  const [filtrosCol, setFiltrosCol] = useState<Record<string, string>>({});

  const { data: linhas, isLoading } = useQuery({
    queryKey: ["calendario", tenantId, aba],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("calendario_linhas")
        .select("id, aba, ano, ordem, chave_natural, dados, conflitos, comentarios, curso_id")
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
    // Filtros por coluna (Fase 11.7): applies AND — todos ativos precisam bater.
    const ativos = Object.entries(filtrosCol).filter(([, v]) => v.trim().length > 0);
    if (ativos.length > 0) {
      l = l.filter((r) => ativos.every(([chave, valor]) => {
        const v = (r.dados as Record<string, unknown>)[chave];
        if (v == null) return false;
        return String(v).toLowerCase().includes(valor.trim().toLowerCase());
      }));
    }
    return l;
  }, [linhas, anoFiltro, busca, filtrosCol]);

  const temFiltroCol = Object.values(filtrosCol).some((v) => v.trim().length > 0);

  // Fase 11 (fix) — Ordem canônica do Excel via colunas-calendario.ts.
  // Postgres jsonb reordena as chaves ao gravar, então Object.keys volta
  // embaralhado. A ordem hard-coded segue o Excel original por aba.
  const colunas = useMemo(() => colunasParaExibir(aba as AbaCalendario, filtradas), [aba, filtradas]);

  if (loading) {
    return (
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("comum.carregando")}</CardContent></Card>
    );
  }
  if (tenants.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {t("calendario.sem_membro")}
        </CardContent>
      </Card>
    );
  }
  if (!tenantId) {
    return (
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("comum.escolha_produto")}</CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("calendario.titulo")}</h1>
          <p className="text-sm text-muted-foreground">{t("calendario.subtitulo")}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {(Object.keys(ABA_LABEL_LOCAL) as Aba[]).map((a) => (
          <Card key={a} className={aba === a ? "border-primary" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">{ABA_LABEL_LOCAL[a]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {(totais?.[a] ?? 0).toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground">{t("calendario.linhas")}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <TabsList>
          {(Object.keys(ABA_LABEL_LOCAL) as Aba[]).map((a) => (
            <TabsTrigger key={a} value={a}>{ABA_LABEL_LOCAL[a]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("calendario.busca_placeholder")}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={anoFiltro}
          onChange={(e) => setAnoFiltro(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">{t("calendario.todos_anos")}</option>
          {anos.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {temFiltroCol && (
          <Button variant="ghost" size="sm" onClick={() => setFiltrosCol({})} className="gap-1 text-xs">
            <X className="h-3 w-3" />{t("calendario.limpar_filtros")}
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {t("calendario.contador_linhas", { n: filtradas.length.toLocaleString() })}
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("comum.carregando")}</CardContent></Card>
      ) : filtradas.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            <CalendarDays className="mx-auto mb-2 h-8 w-8 opacity-50" />
            {t("calendario.sem_linhas_importe")}
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded-md border bg-background">
          <table className="min-w-max text-sm">
            <thead className="sticky top-0 z-20 bg-muted/95 text-left text-xs uppercase text-muted-foreground backdrop-blur">
              <tr>
                <th className="sticky left-0 z-30 bg-muted/95 p-2">{t("calendario.ano")}</th>
                <th className="sticky left-14 z-30 bg-muted/95 p-2">{t("calendario.ordem")}</th>
                {colunas.map((c) => (
                  <th key={c} className="whitespace-nowrap p-2">{labelColuna(c)}</th>
                ))}
                <th className="p-2">{t("calendario.historico")}</th>
                <th className="p-2">{t("calendario.conflitos")}</th>
              </tr>
              {/* Fase 11.7 — Linha de filtros por coluna. Case-insensitive contains. */}
              <tr className="border-t border-muted-foreground/10">
                <th className="sticky left-0 z-30 bg-muted/95 p-1"></th>
                <th className="sticky left-14 z-30 bg-muted/95 p-1"></th>
                {colunas.map((c) => (
                  <th key={c} className="p-1">
                    <Input
                      value={filtrosCol[c] ?? ""}
                      onChange={(e) => setFiltrosCol((prev) => ({ ...prev, [c]: e.target.value }))}
                      placeholder={t("calendario.filtrar_placeholder")}
                      className="h-7 min-w-24 border-muted-foreground/20 bg-background/60 text-xs font-normal normal-case"
                    />
                  </th>
                ))}
                <th className="p-1"></th>
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 200).map((l) => {
                const eventos = Array.isArray(l.comentarios) ? l.comentarios : [];
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-background p-2 font-medium">{l.ano}</td>
                    <td className="sticky left-14 z-10 bg-background p-2">{l.ordem}</td>
                    {colunas.map((c) => (
                      <td key={c} className="whitespace-nowrap p-2">
                        {formatarCelula(c, l.dados[c])}
                      </td>
                    ))}
                    <td className="p-2">
                      {eventos.length > 0 && <HistoricoBadge eventos={eventos} />}
                    </td>
                    <td className="p-2">
                      {Object.keys(l.conflitos ?? {}).length > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {Object.keys(l.conflitos).length}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtradas.length > 200 && (
            <div className="border-t bg-muted/20 p-2 text-center text-xs text-muted-foreground">
              {t("calendario.mostrando_primeiras", { n: 200, total: filtradas.length.toLocaleString() })} {t("calendario.refine_filtros")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Fase 11 — Formata célula pra exibição na tabela. Se a chave da coluna
 * indica data (DATA / LIVE / QUESTIONÁRIO / CAPTAÇÃO / INÍCIO / FIM) e o
 * valor casa com ISO YYYY-MM-DD, formata em pt-BR/es-ES (dd/mm/aaaa).
 * Do contrário, string ou JSON cru.
 */
function formatarCelula(chave: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const upper = chave.toUpperCase();
    const isData = /DATA|LIVE|QUESTIONÁRIO|CAPTAÇÃO|IN[IÍ]CIO|FIM|PRONTA|FECHAMENTO|ENVIO|PROTOCOLOS|BASE|CORRE[CÇ][AÃ]O|ENTREGA|PROVA/i.test(upper);
    if (isData) {
      const [y, m, d] = v.split("-");
      return `${d}/${m}/${y}`;
    }
    return v;
  }
  if (typeof v === "string" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

// Fase 8 — Badge + popover mostrando histórico de alterações da linha.
function HistoricoBadge({ eventos }: { eventos: EventoComentario[] }) {
  const { t } = useT();
  const ultimos = [...eventos].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-800 hover:bg-sky-500/20 dark:text-sky-300"
          aria-label={t("calendario.n_alteracoes_reg", { n: eventos.length })}
        >
          <History className="h-3 w-3" />
          {eventos.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">
          {eventos.length === 1
            ? t("calendario.historico_qtd_um", { n: eventos.length })
            : t("calendario.historico_qtd_mais", { n: eventos.length })}
        </div>
        <ul className="max-h-80 divide-y overflow-y-auto">
          {ultimos.map((ev, i) => (
            <li key={i} className="p-3 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-mono">{new Date(ev.criado_em).toLocaleString()}</span>
                {ev.tipo && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{ev.tipo}</span>}
              </div>
              {ev.campo_alterado && (
                <div className="mt-1">
                  <span className="text-muted-foreground">{ev.campo_alterado}: </span>
                  <span className="line-through text-muted-foreground">{formatarCelula(ev.valor_anterior)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-medium">{formatarCelula(ev.valor_novo)}</span>
                </div>
              )}
              <div className="mt-1">{ev.motivo}</div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
