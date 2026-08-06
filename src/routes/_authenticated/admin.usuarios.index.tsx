import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, Clock, CheckCircle2, XCircle, X, Loader2, ShieldCheck } from "lucide-react";
import { AprovarSplitButton } from "@/components/AprovarSplitButton";
import { UsuarioDrawer } from "@/components/UsuarioDrawer";
import { labelPapel } from "@/lib/papel-labels";
import type { PapelTenant } from "@/contexts/tenant";

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
  motivo_rejeicao: string | null;
}

interface MembroLinha {
  perfil_id: string;
  papel: PapelTenant;
}

function AdminUsuariosPage() {
  const { perfil: atual } = useTenant();
  const [rejeitando, setRejeitando] = useState<Perfil | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const { data: usuarios } = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome, email, admin_global, status, criado_em, aprovado_em, motivo_rejeicao")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Perfil[];
    },
    enabled: !!atual?.admin_global,
  });

  // Pega o papel de cada perfil no primeiro tenant (todos ganham mesmo
  // papel em todos os tenants na Fase 6, entao um tenant so basta).
  const { data: membros } = useQuery({
    queryKey: ["admin-usuarios-papel-representante"],
    queryFn: async () => {
      const { data: t } = await supabase.from("tenants").select("id").limit(1).single();
      if (!t) return [] as MembroLinha[];
      const { data } = await supabase.from("membros").select("perfil_id, papel").eq("tenant_id", t.id);
      return (data ?? []) as MembroLinha[];
    },
    enabled: !!atual?.admin_global,
  });

  if (!atual?.admin_global) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Só admin global tem acesso.</CardContent></Card>;
  }

  const total = usuarios?.length ?? 0;
  const pendentes = usuarios?.filter((u) => u.status === "pendente").length ?? 0;
  const aprovados = usuarios?.filter((u) => u.status === "aprovado").length ?? 0;
  const rejeitados = usuarios?.filter((u) => u.status === "rejeitado").length ?? 0;

  // Ordena: pendentes primeiro, depois aprovados, depois rejeitados
  const ordenados = [...(usuarios ?? [])].sort((a, b) => {
    const order = { pendente: 0, aprovado: 1, rejeitado: 2 };
    return order[a.status] - order[b.status];
  });

  const papelDe = (perfilId: string): PapelTenant | null => {
    return membros?.find((m) => m.perfil_id === perfilId)?.papel ?? null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Todo aprovado tem acesso a todos os produtos automaticamente. Pendentes ficam no topo — aprove ou rejeite direto na linha.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Total" valor={total} icone={<Users className="h-4 w-4" />} />
        <KpiCard label="Pendentes" valor={pendentes} icone={<Clock className="h-4 w-4" />} tom={pendentes > 0 ? "warn" : "default"} />
        <KpiCard label="Aprovados" valor={aprovados} icone={<CheckCircle2 className="h-4 w-4" />} tom="ok" />
        <KpiCard label="Rejeitados" valor={rejeitados} icone={<XCircle className="h-4 w-4" />} tom={rejeitados > 0 ? "bad" : "default"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Todos os usuários</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Nome</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Perfil</th>
                  <th className="p-2">Cadastrado</th>
                  <th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((u) => {
                  const isPendente = u.status === "pendente";
                  const isRejeitado = u.status === "rejeitado";
                  const papel = papelDe(u.id);
                  return (
                    <tr
                      key={u.id}
                      className={`border-t ${isPendente ? "bg-amber-500/5" : ""} ${!isPendente && !isRejeitado ? "cursor-pointer hover:bg-muted/20" : ""}`}
                      onClick={() => !isPendente && !isRejeitado && setDrawerId(u.id)}
                    >
                      <td className="p-2 font-medium">{u.nome}</td>
                      <td className="p-2 text-xs">{u.email}</td>
                      <td className="p-2"><StatusBadge status={u.status} /></td>
                      <td className="p-2 text-xs">
                        {u.status === "aprovado" ? (
                          <PerfilChip papel={papel} adminGlobal={u.admin_global} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(u.criado_em).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        {isPendente ? (
                          <div className="flex justify-end gap-2">
                            <AprovarSplitButton perfilId={u.id} nome={u.nome} />
                            <Button size="sm" variant="outline" onClick={() => setRejeitando(u)}>
                              <X className="mr-1 h-4 w-4" />Rejeitar
                            </Button>
                          </div>
                        ) : (
                          <div className="text-right text-xs text-muted-foreground">
                            {u.status === "aprovado" ? "clique na linha" : (u.motivo_rejeicao ?? "—")}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {rejeitando && (
        <RejeitarModal user={rejeitando} onClose={() => setRejeitando(null)} />
      )}
      {drawerId && (
        <UsuarioDrawer perfilId={drawerId} onClose={() => setDrawerId(null)} />
      )}
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

function PerfilChip({ papel, adminGlobal }: { papel: PapelTenant | null; adminGlobal: boolean }) {
  if (adminGlobal) {
    return (
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="h-3 w-3" />Admin +A
      </Badge>
    );
  }
  if (!papel) return <span className="text-muted-foreground">sem perfil</span>;
  return <Badge variant="outline">{labelPapel(papel)}</Badge>;
}

function RejeitarModal({ user, onClose }: { user: Perfil; onClose: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rejeitar-usuario`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ perfil_id: user.id, motivo: motivo.trim() }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error ?? "Erro ao rejeitar");
      return json;
    },
    onSuccess: () => {
      toast.success("Usuário rejeitado");
      qc.invalidateQueries();
      onClose();
    },
    onError: (err: Error) => toast.error("Falha ao rejeitar", { description: err.message }),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeitar {user.nome}</DialogTitle>
          <DialogDescription>{user.email}. O usuário verá o motivo na tela dele.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Motivo *</label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} placeholder="Explique por que o cadastro foi rejeitado…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Cancelar</Button>
          <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending || !motivo.trim()}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rejeitando…</> : "Rejeitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
