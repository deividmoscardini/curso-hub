import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/contexts/i18n";
import { formatarData, formatarDataHora } from "@/lib/formatar-data";

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
  const { t, idioma } = useT();
  const STATUS_LABEL_LOCAL: Record<StatusSolicitacao, string> = {
    pendente: t("solicitacao_detalhe.status_pendente"),
    em_revisao: t("solicitacao_detalhe.status_pendente"),
    aprovada: t("solicitacao_detalhe.status_aprovada"),
    aplicada: t("solicitacao_detalhe.status_aplicada"),
    rejeitada: t("solicitacao_detalhe.status_rejeitada"),
    devolvida: t("solicitacao_detalhe.status_devolvida"),
  };
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
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("admin_solicitacoes.so_admin")}</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin_solicitacoes.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin_solicitacoes.fila_desc")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        {(Object.keys(STATUS_LABEL_LOCAL) as StatusSolicitacao[]).map((s) => (
          <Card key={s} className={statusFiltro === s ? "border-primary" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">{STATUS_LABEL_LOCAL[s]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{contagens[s]}</div>
              <Button
                variant="link" size="sm" className="h-auto p-0 text-xs"
                onClick={() => setStatusFiltro(statusFiltro === s ? "" : s)}
              >
                {statusFiltro === s ? t("admin_solicitacoes.limpar_filtro") : t("admin_solicitacoes.filtrar")}
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
          <option value="">{t("admin_solicitacoes.todos_tipos")}</option>
          <option value="novo_curso">{t("admin_solicitacoes.tipo_novo_curso")}</option>
          <option value="ajuste_ancora">{t("admin_solicitacoes.tipo_alterar_data_live")}</option>
          <option value="ajuste_manual">{t("admin_solicitacoes.tipo_alterar_data_termino")}</option>
          <option value="reordenar_carrossel">{t("admin_solicitacoes.tipo_reordenar")}</option>
          <option value="nova_oferta">{t("admin_solicitacoes.tipo_nova_oferta")}</option>
          <option value="cancelar_oferta">{t("admin_solicitacoes.tipo_cancelar_oferta")}</option>
          <option value="gerar_ano">{t("admin_solicitacoes.tipo_gerar_ano")}</option>
        </select>
        <div className="ml-auto text-xs text-muted-foreground">
          {t("admin_solicitacoes.contagem", { n: filtradas.length.toLocaleString() })}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">{t("solicitacoes_lista.coluna_criada")}</th>
                  <th className="p-2">{t("admin_solicitacoes.coluna_solicitante")}</th>
                  <th className="p-2">{t("admin_solicitacoes.coluna_produto")}</th>
                  <th className="p-2">{t("admin_solicitacoes.coluna_tipo")}</th>
                  <th className="p-2">{t("calendario.ano")}</th>
                  <th className="p-2">{t("admin_solicitacoes.coluna_status")}</th>
                  <th className="p-2">{t("admin_solicitacoes.aprovado_em")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">{t("admin_solicitacoes.sem_solicitacoes")}</td></tr>
                ) : filtradas.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-muted/20">
                    <td className="p-2 text-xs">{formatarDataHora(s.criado_em, idioma)}</td>
                    <td className="p-2 text-xs">
                      <div className="font-medium">{s.solicitante?.nome ?? "?"}</div>
                      <div className="text-[10px] text-muted-foreground">{s.solicitante?.email}</div>
                    </td>
                    <td className="p-2 text-xs">{s.tenants?.nome ?? "—"}</td>
                    <td className="p-2 text-xs capitalize">{s.tipo.replace(/_/g, " ")}</td>
                    <td className="p-2 text-xs">{s.ano ?? "—"}</td>
                    <td className="p-2">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLS[s.status]}`}>
                        {STATUS_LABEL_LOCAL[s.status]}
                      </span>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {s.aprovado_em ? formatarData(s.aprovado_em, idioma) : "—"}
                    </td>
                    <td className="p-2 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/solicitacoes/$id" params={{ id: s.id }}>{t("admin_solicitacoes.ver")}</Link>
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
