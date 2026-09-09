import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, AlertTriangle, History, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/contexts/i18n";
import { colunasParaExibir, labelColuna, type AbaCalendario } from "@/lib/colunas-calendario";
import {
  DEFS_POR_ABA,
  aplicarFiltros,
  contarFiltrosAtivos,
  decodeFiltros,
  encodeFiltros,
  type FiltrosEstado,
} from "@/lib/calendario-filtros";
import { formatarDataHora } from "@/lib/formatar-data";
import { CalendarioFiltrosDrawer } from "@/components/calendario/CalendarioFiltrosDrawer";
import { FiltroChips } from "@/components/calendario/FiltroChips";

type Aba = "disciplinas" | "projeto_aplicacao" | "prova_substitutiva" | "fechamento";

interface SearchParams {
  aba?: Aba;
  ano?: string;
  f?: string;
}

const ABAS_VALIDAS: Aba[] = ["disciplinas", "projeto_aplicacao", "prova_substitutiva", "fechamento"];

export const Route = createFileRoute("/_authenticated/calendario/")({
  head: () => ({
    meta: [{ title: "Calendário — Calendário +A" }],
  }),
  // Fase 11.10 — Filtros persistem em URL query params:
  //   ?aba=disciplinas&ano=2027&q=etica&f=<base64>
  // Permite compartilhar o link exato entre membros do time.
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    aba: typeof s.aba === "string" && ABAS_VALIDAS.includes(s.aba as Aba) ? (s.aba as Aba) : undefined,
    ano: typeof s.ano === "string" ? s.ano : undefined,
    f: typeof s.f === "string" ? s.f : undefined,
  }),
  component: CalendarioPage,
});

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

function CalendarioPage() {
  const { tenantId, tenants, loading } = useTenant();
  const { t } = useT();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const ABA_LABEL_LOCAL: Record<Aba, string> = {
    disciplinas: t("calendario.aba_disciplinas"),
    projeto_aplicacao: t("calendario.aba_projeto_aplicacao"),
    prova_substitutiva: t("calendario.aba_prova_substitutiva"),
    fechamento: t("calendario.aba_fechamento"),
  };
  // Fase 11.10 — Estado inicial vem da URL (deep-link). Escrever no
  // state também escreve na URL via useEffect abaixo.
  // Fase 12.10 — busca global removida (Bruna: "não facilita a busca").
  // Filtros por coluna via drawer cobrem o caso de uso.
  const [aba, setAba] = useState<Aba>(search.aba ?? "disciplinas");
  const [anoFiltro, setAnoFiltro] = useState<string>(search.ano ?? "");
  const [filtros, setFiltros] = useState<FiltrosEstado>(() => decodeFiltros(search.f));
  const [drawerAberto, setDrawerAberto] = useState(false);

  useEffect(() => {
    navigate({
      search: {
        aba: aba === "disciplinas" ? undefined : aba,
        ano: anoFiltro || undefined,
        f: encodeFiltros(filtros),
      },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, anoFiltro, filtros]);

  const { data: linhas, isLoading } = useQuery({
    queryKey: ["calendario", tenantId, aba],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("calendario_linhas")
        .select("id, aba, ano, ordem, chave_natural, dados, conflitos, comentarios, curso_id")
        .eq("tenant_id", tenantId)
        .eq("aba", aba)
        // Fase 12.19 — ordenar por codigo do curso (jsonb) e depois por
        // sequencia de captacao (`ordem`). Bruna: "a ordem de apresentacao
        // sempre pela ordem numerica do curso, seguido pela sequencia de
        // captacao". Vale para as 4 abas.
        .order("ano", { ascending: true })
        .order("dados->>CÓD CURSO", { ascending: true })
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
    let l: Linha[] = linhas ?? [];
    if (anoFiltro) l = l.filter((r) => String(r.ano) === anoFiltro);
    return aplicarFiltros(l, filtros, DEFS_POR_ABA[aba as AbaCalendario]) as Linha[];
  }, [linhas, anoFiltro, filtros, aba]);

  const nFiltros = useMemo(() => contarFiltrosAtivos(filtros), [filtros]);

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

      {/* Fase 12.22 — Cards KPI em barra compacta (antes ocupavam ~180px de
          altura com 4 cards grandes, comprometendo scroll em notebooks). Agora
          uma unica linha com nome + contador inline. */}
      <div className="flex flex-wrap gap-2 rounded-md border bg-background px-3 py-2">
        {(Object.keys(ABA_LABEL_LOCAL) as Aba[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition ${
              aba === a ? "bg-primary/10 text-primary" : "hover:bg-muted"
            }`}
          >
            <span className="font-medium">{ABA_LABEL_LOCAL[a]}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
              aba === a ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {(totais?.[a] ?? 0).toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        {/* Fase 12.13 — TabsList com overflow-x pra caber "Prova Substitutiva" e
            "Fechamento de turmas" em telas estreitas sem quebrar layout. */}
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          {(Object.keys(ABA_LABEL_LOCAL) as Aba[]).map((a) => (
            <TabsTrigger key={a} value={a} className="whitespace-nowrap">{ABA_LABEL_LOCAL[a]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDrawerAberto(true)}
          className="gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("calendario.filtros_botao")}
          {nFiltros > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {nFiltros}
            </Badge>
          )}
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          {t("calendario.contador_linhas", { n: filtradas.length.toLocaleString() })}
        </div>
      </div>

      <FiltroChips aba={aba as AbaCalendario} filtros={filtros} onChange={setFiltros} />

      <CalendarioFiltrosDrawer
        open={drawerAberto}
        onOpenChange={setDrawerAberto}
        aba={aba as AbaCalendario}
        linhas={linhas ?? []}
        filtros={filtros}
        onChange={setFiltros}
      />

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
                {/* Fase 12.18 — Nenhuma coluna eh sticky-left. Bruna: "ao rolar
                    a barra pra direita o ANO fica fixo, precisamos que ele
                    acompanhe a rolagem". Todas as colunas rolam junto agora. */}
                {colunas.map((c) => (
                  <th key={c} className="whitespace-nowrap p-2">
                    {labelColuna(c)}
                  </th>
                ))}
                <th className="p-2">{t("calendario.historico")}</th>
                <th className="p-2">{t("calendario.conflitos")}</th>
              </tr>
              {/* Fase 11.9 — Linha de inputs de filtro no thead removida.
                  Filtros migraram pro drawer lateral e chips no topo. */}
            </thead>
            <tbody>
              {filtradas.slice(0, 200).map((l) => {
                const eventos = Array.isArray(l.comentarios) ? l.comentarios : [];
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/20">
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
                        <ConflitosBadge conflitos={l.conflitos as Record<string, string>} />
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

// Fase 12.20 — Popover com os detalhes dos conflitos da linha. Antes o
// badge só mostrava o número; agora clica pra ver quais campos + mensagem.
function ConflitosBadge({ conflitos }: { conflitos: Record<string, string> }) {
  const chaves = Object.keys(conflitos);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-800 hover:bg-red-500/20 dark:text-red-300"
        >
          <AlertTriangle className="h-3 w-3" />
          {chaves.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">
          {chaves.length === 1 ? "1 conflito" : `${chaves.length} conflitos`}
        </div>
        <ul className="max-h-80 divide-y overflow-y-auto">
          {chaves.map((k) => (
            <li key={k} className="p-3 text-xs">
              <div className="font-medium text-red-800 dark:text-red-300">
                {k.startsWith("_") ? "Aviso do motor" : k}
              </div>
              <div className="mt-1 text-muted-foreground">{conflitos[k]}</div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// Fase 8 — Badge + popover mostrando histórico de alterações da linha.
function HistoricoBadge({ eventos }: { eventos: EventoComentario[] }) {
  const { t, idioma } = useT();
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
                <span className="font-mono">{formatarDataHora(ev.criado_em, idioma)}</span>
                {ev.tipo && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{ev.tipo}</span>}
              </div>
              {ev.campo_alterado && (
                <div className="mt-1">
                  <span className="text-muted-foreground">{ev.campo_alterado}: </span>
                  <span className="line-through text-muted-foreground">{formatarCelula(ev.campo_alterado, ev.valor_anterior)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-medium">{formatarCelula(ev.campo_alterado, ev.valor_novo)}</span>
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
