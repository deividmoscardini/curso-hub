import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, XCircle, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/usuarios/")({
  head: () => ({ meta: [{ title: "Usuários — Admin" }] }),
  component: AdminUsuariosPage,
});

interface Perfil {
  id: string;
  nome: string;
  email: string;
  admin_global: boolean;
  status: "pendente" | "aprovado" | "rejeitado";
  criado_em: string;
  aprovado_em: string | null;
}

function AdminUsuariosPage() {
  const { perfil } = useTenant();

  const { data: usuarios } = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome, email, admin_global, status, criado_em, aprovado_em")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Perfil[];
    },
    enabled: !!perfil?.admin_global,
  });

  if (!perfil?.admin_global) {
    return (
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">
        Só admin global tem acesso.
      </CardContent></Card>
    );
  }

  const total = usuarios?.length ?? 0;
  const pendentes = usuarios?.filter((u) => u.status === "pendente").length ?? 0;
  const aprovados = usuarios?.filter((u) => u.status === "aprovado").length ?? 0;
  const rejeitados = usuarios?.filter((u) => u.status === "rejeitado").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral de todos os usuários da plataforma.
          </p>
        </div>
        {pendentes > 0 && (
          <Button asChild>
            <Link to="/admin/usuarios/pendentes">
              <Clock className="mr-2 h-4 w-4" />
              {pendentes} aguardando aprovação
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Total" valor={total} icone={<Users className="h-4 w-4" />} />
        <KpiCard label="Pendentes" valor={pendentes} icone={<Clock className="h-4 w-4" />} tom={pendentes > 0 ? "warn" : "default"} />
        <KpiCard label="Aprovados" valor={aprovados} icone={<CheckCircle2 className="h-4 w-4" />} tom="ok" />
        <KpiCard label="Rejeitados" valor={rejeitados} icone={<XCircle className="h-4 w-4" />} tom={rejeitados > 0 ? "bad" : "default"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Todos os usuários</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Nome</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Perfil</th>
                  <th className="p-2">Cadastrado</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {usuarios?.map((u) => (
                  <tr key={u.id} className="border-t hover:bg-muted/20">
                    <td className="p-2 font-medium">{u.nome}</td>
                    <td className="p-2 text-xs">{u.email}</td>
                    <td className="p-2"><StatusBadge status={u.status} /></td>
                    <td className="p-2 text-xs">
                      {u.admin_global ? <Badge variant="secondary">admin global</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {new Date(u.criado_em).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-2 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/admin/usuarios/$id" params={{ id: u.id }}>Ver</Link>
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

function KpiCard({ label, valor, icone, tom = "default" }: { label: string; valor: number; icone?: React.ReactNode; tom?: "default" | "ok" | "warn" | "bad" }) {
  const tomClass = { default: "", ok: "border-emerald-500/40", warn: "border-amber-500/40", bad: "border-rose-500/40" }[tom];
  return (
    <Card className={tomClass}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground">
          {icone}{label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{valor.toLocaleString("pt-BR")}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "pendente" | "aprovado" | "rejeitado" }) {
  const map = {
    pendente: { label: "Pendente", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    aprovado: { label: "Aprovado", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    rejeitado: { label: "Rejeitado", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  }[status];
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${map.cls}`}>{map.label}</span>;
}
