import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check, X, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/usuarios/pendentes")({
  head: () => ({ meta: [{ title: "Pendentes — Admin" }] }),
  component: PendentesPage,
});

interface Pendente {
  id: string;
  nome: string;
  email: string;
  criado_em: string;
}

interface Tenant { id: string; nome: string; }

type Papel = "owner" | "aprovador" | "editor" | "solicitante_interno" | "solicitante_externo" | "visualizador";

const PAPEIS: { valor: Papel; label: string }[] = [
  { valor: "owner", label: "Owner do produto" },
  { valor: "aprovador", label: "Aprovador" },
  { valor: "editor", label: "Editor operacional" },
  { valor: "solicitante_interno", label: "Solicitante interno" },
  { valor: "solicitante_externo", label: "Solicitante externo" },
  { valor: "visualizador", label: "Visualizador" },
];

function PendentesPage() {
  const qc = useQueryClient();
  const { perfil } = useTenant();
  const [aprovando, setAprovando] = useState<Pendente | null>(null);
  const [rejeitando, setRejeitando] = useState<Pendente | null>(null);

  const { data: pendentes } = useQuery({
    queryKey: ["usuarios-pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome, email, criado_em")
        .eq("status", "pendente")
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Pendente[];
    },
    enabled: !!perfil?.admin_global,
  });

  const { data: tenants } = useQuery({
    queryKey: ["tenants-todos"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id, nome").order("nome");
      return (data ?? []) as Tenant[];
    },
  });

  if (!perfil?.admin_global) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Só admin global.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários pendentes</h1>
        <p className="text-sm text-muted-foreground">
          Aprove ou rejeite cadastros novos. Ao aprovar, atribua produto(s) e papel.
        </p>
      </div>

      {(pendentes?.length ?? 0) === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Nenhum usuário aguardando aprovação.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {pendentes?.map((u) => (
            <Card key={u.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{u.nome}</CardTitle>
                    <CardDescription>{u.email}</CardDescription>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Cadastrado em {new Date(u.criado_em).toLocaleString("pt-BR")}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setRejeitando(u)}>
                  <X className="mr-2 h-4 w-4" />Rejeitar
                </Button>
                <Button size="sm" onClick={() => setAprovando(u)}>
                  <Check className="mr-2 h-4 w-4" />Aprovar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {aprovando && (
        <AprovarModal
          user={aprovando}
          tenants={tenants ?? []}
          onClose={() => setAprovando(null)}
          onDone={() => { setAprovando(null); qc.invalidateQueries(); }}
        />
      )}
      {rejeitando && (
        <RejeitarModal
          user={rejeitando}
          onClose={() => setRejeitando(null)}
          onDone={() => { setRejeitando(null); qc.invalidateQueries(); }}
        />
      )}
    </div>
  );
}

function AprovarModal({ user, tenants, onClose, onDone }: { user: Pendente; tenants: Tenant[]; onClose: () => void; onDone: () => void }) {
  const [tenantId, setTenantId] = useState<string>(tenants[0]?.id ?? "");
  const [papel, setPapel] = useState<Papel>("solicitante_interno");

  const mut = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aprovar-usuario`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          perfil_id: user.id,
          atribuicoes: tenantId ? [{ tenant_id: tenantId, papel }] : [],
        }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error ?? "Erro ao aprovar");
      return json;
    },
    onSuccess: () => {
      toast.success("Usuário aprovado", { description: `${user.email} agora tem acesso.` });
      onDone();
    },
    onError: (err: Error) => toast.error("Falha ao aprovar", { description: err.message }),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar {user.nome}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Produto</label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger><SelectValue placeholder="Selecionar produto" /></SelectTrigger>
              <SelectContent>
                {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Papel</label>
            <Select value={papel} onValueChange={(v) => setPapel(v as Papel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => <SelectItem key={p.valor} value={p.valor}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Depois você pode adicionar mais produtos/papeis no detalhe do usuário.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !tenantId}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Aprovando…</> : "Aprovar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejeitarModal({ user, onClose, onDone }: { user: Pendente; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rejeitar-usuario`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ perfil_id: user.id, motivo: motivo.trim() }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error ?? "Erro ao rejeitar");
      return json;
    },
    onSuccess: () => {
      toast.success("Usuário rejeitado");
      onDone();
    },
    onError: (err: Error) => toast.error("Falha ao rejeitar", { description: err.message }),
  });

  const podeEnviar = motivo.trim().length > 0;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeitar {user.nome}</DialogTitle>
          <DialogDescription>
            {user.email}. O usuário verá esse motivo na tela dele.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Motivo *</label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Explique por que o cadastro foi rejeitado…"
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Cancelar</Button>
          <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending || !podeEnviar}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rejeitando…</> : "Rejeitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
