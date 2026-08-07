import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/contexts/i18n";

export const Route = createFileRoute("/_authenticated/admin/usuarios/$id")({
  head: () => ({ meta: [{ title: "Detalhe do usuário — Admin" }] }),
  component: DetalheUsuarioPage,
});

interface Perfil {
  id: string; nome: string; email: string; admin_global: boolean;
  status: "pendente" | "aprovado" | "rejeitado";
  motivo_rejeicao: string | null;
  criado_em: string; aprovado_em: string | null; aprovado_por: string | null;
}
interface MembroDetalhe {
  tenant_id: string; papel: string;
  tenants: { id: string; nome: string } | null;
}
interface LogRow {
  id: string; acao: string; entidade: string | null; motivo: string | null; criado_em: string;
}

function DetalheUsuarioPage() {
  const { id } = Route.useParams();
  const { perfil: atual } = useTenant();
  const { t } = useT();

  const { data: perfil } = useQuery({
    queryKey: ["admin-usuario", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome, email, admin_global, status, motivo_rejeicao, criado_em, aprovado_em, aprovado_por")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Perfil | null;
    },
    enabled: !!atual?.admin_global,
  });

  const { data: membros } = useQuery({
    queryKey: ["admin-usuario-membros", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("membros")
        .select("tenant_id, papel, tenants(id, nome)")
        .eq("perfil_id", id);
      return (data ?? []) as unknown as MembroDetalhe[];
    },
    enabled: !!atual?.admin_global,
  });

  const { data: logs } = useQuery({
    queryKey: ["admin-usuario-logs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("log_auditoria")
        .select("id, acao, entidade, motivo, criado_em")
        .or(`ator_id.eq.${id},entidade_id.eq.${id}`)
        .order("criado_em", { ascending: false })
        .limit(50);
      return (data ?? []) as LogRow[];
    },
    enabled: !!atual?.admin_global,
  });

  if (!atual?.admin_global) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("admin_solicitacoes.so_admin")}</CardContent></Card>;
  }
  if (!perfil) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("comum.carregando")}</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/usuarios"><ArrowLeft className="mr-1 h-4 w-4" />{t("comum.voltar")}</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{perfil.nome}</h1>
        <p className="text-sm text-muted-foreground">{perfil.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("admin_usuarios.situacao")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Linha label={t("admin_usuarios.coluna_status")}><StatusBadge status={perfil.status} /></Linha>
            <Linha label={t("admin_usuarios.admin_global_lbl")}>{perfil.admin_global ? t("comum.sim") : t("comum.nao")}</Linha>
            <Linha label={t("admin_usuarios.cadastrado_em")}>{new Date(perfil.criado_em).toLocaleString()}</Linha>
            {perfil.aprovado_em && (
              <Linha label={t("admin_usuarios.aprovado_em_lbl")}>{new Date(perfil.aprovado_em).toLocaleString()}</Linha>
            )}
            {perfil.motivo_rejeicao && (
              <Linha label={t("admin_usuarios.motivo_rejeicao_col")}><span className="text-rose-600">{perfil.motivo_rejeicao}</span></Linha>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin_usuarios.produtos_membros")}</CardTitle>
            <CardDescription>{t("admin_usuarios.produtos_membros_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {(membros?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin_usuarios.nao_e_membro")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {membros?.map((m) => (
                  <li key={m.tenant_id} className="flex items-center justify-between">
                    <span>{m.tenants?.nome ?? m.tenant_id}</span>
                    <Badge variant="outline" className="capitalize text-xs">{m.papel.replace("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin_usuarios.historico_titulo")}</CardTitle>
          <CardDescription>{t("admin_usuarios.historico_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {(logs?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin_usuarios.nenhuma_acao")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2">{t("admin_usuarios.coluna_data")}</th>
                    <th className="p-2">{t("auditoria.coluna_acao")}</th>
                    <th className="p-2">{t("auditoria.coluna_entidade")}</th>
                    <th className="p-2">{t("admin_usuarios.coluna_motivo_nota")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs?.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2 text-xs">{new Date(l.criado_em).toLocaleString()}</td>
                      <td className="p-2 font-mono text-xs">{l.acao}</td>
                      <td className="p-2 text-xs text-muted-foreground">{l.entidade ?? "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground">{l.motivo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
function StatusBadge({ status }: { status: "pendente" | "aprovado" | "rejeitado" }) {
  const { t } = useT();
  const map = {
    pendente: { label: t("admin_usuarios.status_pendente_lbl"), cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    aprovado: { label: t("admin_usuarios.status_aprovado_lbl"), cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    rejeitado: { label: t("admin_usuarios.status_rejeitado_lbl"), cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  }[status];
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${map.cls}`}>{map.label}</span>;
}
