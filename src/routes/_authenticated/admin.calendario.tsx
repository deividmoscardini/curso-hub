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
import { AlertTriangle, Pencil, ArrowLeft, RefreshCcw, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarioEditModal, type LinhaEditavel } from "@/components/CalendarioEditModal";
import { useT } from "@/contexts/i18n";
import { colunasParaExibir, labelColuna, type AbaCalendario } from "@/lib/colunas-calendario";

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
  const { t } = useT();
  const qc = useQueryClient();
  const ABA_LABEL_LOCAL: Record<Aba, string> = {
    disciplinas: t("calendario.aba_disciplinas"),
    projeto_aplicacao: t("calendario.aba_projeto_aplicacao"),
    prova_substitutiva: t("calendario.aba_prova_substitutiva"),
    fechamento: t("calendario.aba_fechamento"),
  };
  const [aba, setAba] = useState<Aba>("disciplinas");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<LinhaEditavel | null>(null);
  const [recalcularAberto, setRecalcularAberto] = useState(false);
  const [recalcularAno, setRecalcularAno] = useState<number>(new Date().getFullYear());
  const [recalculando, setRecalculando] = useState(false);

  async function executarRecalculo() {
    if (!tenantId) return;
    setRecalculando(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recalcular-datas`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ tenant_id: tenantId, aba, ano: recalcularAno }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) {
        toast.error(t("admin_calendario.recalcular_toast_erro"), { description: json.error ?? "Erro" });
      } else {
        toast.success(t("admin_calendario.recalcular_toast_ok", { linhas: json.linhas_atualizadas, cursos: json.cursos_processados }));
        if (json.avisos && json.avisos.length > 0) {
          toast.warning(t("admin_calendario.recalcular_toast_avisos", { n: json.avisos.length }), {
            description: json.avisos.slice(0, 5).join(" · "),
          });
        }
        qc.invalidateQueries({ queryKey: ["admin-calendario"] });
        qc.invalidateQueries({ queryKey: ["calendario"] });
        setRecalcularAberto(false);
      }
    } catch (err) {
      toast.error(t("admin_calendario.recalcular_toast_erro"), { description: String(err instanceof Error ? err.message : err) });
    } finally {
      setRecalculando(false);
    }
  }

  if (!perfil?.admin_global) {
    return (
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">
        {t("comum.sem_permissao_admin")}
      </CardContent></Card>
    );
  }
  if (!tenantId) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("comum.escolha_produto")}</CardContent></Card>;
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

  // Fase 11 (fix) — Ordem canônica do Excel (jsonb reordena chaves).
  const colunas = useMemo(() => colunasParaExibir(aba as AbaCalendario, linhas ?? []), [aba, linhas]);

  function formatarCel(chave: string, v: unknown): string {
    if (v == null || v === "") return "—";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const isData = /DATA|LIVE|QUESTIONÁRIO|CAPTAÇÃO|IN[IÍ]CIO|FIM|PRONTA|FECHAMENTO|ENVIO|PROTOCOLOS|BASE|CORRE[CÇ][AÃ]O|PROVA/i.test(chave.toUpperCase());
      if (isData) { const [y, m, d] = v.split("-"); return `${d}/${m}/${y}`; }
      return v;
    }
    if (typeof v === "string" || typeof v === "number") return String(v);
    return JSON.stringify(v);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/calendario"><ArrowLeft className="mr-1 h-4 w-4" />{t("admin_calendario.calendario_publico")}</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("admin_calendario.titulo")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin_calendario.subtitulo")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRecalcularAberto(true)}>
          <RefreshCcw className="mr-2 h-4 w-4" />{t("admin_calendario.recalcular_datas")}
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>{t("admin_calendario.aviso")}</div>
      </div>

      <div className="flex items-center gap-2">
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList>
            {(["disciplinas", "projeto_aplicacao", "prova_substitutiva", "fechamento"] as const).map((a) => (
              <TabsTrigger key={a} value={a}>{ABA_LABEL_LOCAL[a]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("admin_calendario.busca_placeholder_admin")} className="max-w-sm" />
      </div>

      {isLoading ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("comum.carregando")}</CardContent></Card>
      ) : filtradas.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("admin_calendario.sem_linhas_aba_curto")}</CardContent></Card>
      ) : (
        <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded-md border bg-background">
          <table className="min-w-max text-sm">
            <thead className="sticky top-0 z-20 bg-muted/95 text-left text-xs uppercase text-muted-foreground backdrop-blur">
              <tr>
                <th className="sticky left-0 z-30 bg-muted/95 p-2">{t("admin_calendario.chave")}</th>
                {colunas.map((c) => (<th key={c} className="whitespace-nowrap p-2">{labelColuna(c)}</th>))}
                <th className="p-2">{t("calendario.historico")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 200).map((l) => {
                const eventos = Array.isArray(l.comentarios) ? l.comentarios : [];
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-background p-2 font-mono text-xs">{l.chave_natural}</td>
                    {colunas.map((c) => (
                      <td key={c} className="whitespace-nowrap p-2">
                        {formatarCel(c, (l.dados as Record<string, unknown>)[c])}
                      </td>
                    ))}
                    <td className="p-2">
                      {eventos.length > 0 && (
                        <Badge variant="secondary">{eventos.length}</Badge>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditando(l)}>
                        <Pencil className="mr-1 h-3 w-3" />{t("comum.editar")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtradas.length > 200 && (
            <div className="border-t bg-muted/20 p-2 text-center text-xs text-muted-foreground">
              {t("admin_calendario.mostrando_admin", { n: 200, total: filtradas.length.toLocaleString() })}
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

      {/* Fase 11.2 — Modal de confirmação do recálculo. */}
      <Dialog open={recalcularAberto} onOpenChange={(o) => !recalculando && setRecalcularAberto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin_calendario.recalcular_titulo")}</DialogTitle>
            <DialogDescription>{t("admin_calendario.recalcular_desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("admin_calendario.recalcular_ano_lbl")}</label>
            <Input
              type="number"
              min={2020}
              max={2100}
              value={recalcularAno}
              onChange={(e) => setRecalcularAno(parseInt(e.target.value, 10) || new Date().getFullYear())}
              disabled={recalculando}
            />
            <div className="text-xs text-muted-foreground">
              Aba: <span className="font-medium">{ABA_LABEL_LOCAL[aba]}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecalcularAberto(false)} disabled={recalculando}>
              {t("comum.cancelar")}
            </Button>
            <Button onClick={executarRecalculo} disabled={recalculando}>
              {recalculando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {recalculando ? t("admin_calendario.recalcular_recalculando") : t("admin_calendario.recalcular_confirmar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
