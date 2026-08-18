import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, Loader2, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PAPEIS_APROVACAO, labelPapel } from "@/lib/papel-labels";
import type { PapelTenant } from "@/contexts/tenant";
import { useT } from "@/contexts/i18n";
import { formatarData } from "@/lib/formatar-data";

// Fase 6.M3 — Painel lateral pra editar rapidamente um usuario aprovado
// sem sair da lista. Mostra dados, papel atual, e permite: mudar papel,
// promover a admin, ou (futuro) remover acesso.

interface Perfil {
  id: string; nome: string; email: string;
  admin_global: boolean;
  status: string;
  criado_em: string;
  aprovado_em: string | null;
  aprovado_por: string | null;
}
interface LogRow { id: string; acao: string; motivo: string | null; criado_em: string; }

export function UsuarioDrawer({ perfilId, onClose }: { perfilId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { t, idioma } = useT();

  const { data: perfil } = useQuery({
    queryKey: ["drawer-usuario", perfilId],
    queryFn: async () => {
      const { data } = await supabase.from("perfis")
        .select("id, nome, email, admin_global, status, criado_em, aprovado_em, aprovado_por")
        .eq("id", perfilId).single();
      return data as Perfil | null;
    },
  });

  const { data: papel } = useQuery({
    queryKey: ["drawer-usuario-papel", perfilId],
    queryFn: async () => {
      const { data: t } = await supabase.from("tenants").select("id").limit(1).single();
      if (!t) return null;
      const { data } = await supabase.from("membros").select("papel").eq("tenant_id", t.id).eq("perfil_id", perfilId).maybeSingle();
      return (data?.papel ?? null) as PapelTenant | null;
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["drawer-usuario-logs", perfilId],
    queryFn: async () => {
      const { data } = await supabase.from("log_auditoria")
        .select("id, acao, motivo, criado_em")
        .eq("entidade_id", perfilId)
        .order("criado_em", { ascending: false })
        .limit(10);
      return (data ?? []) as LogRow[];
    },
  });

  const mudarPapel = useMutation({
    mutationFn: async (novoPapel: PapelTenant | "admin_global") => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const body: Record<string, unknown> = { perfil_id: perfilId };
      if (novoPapel === "admin_global") body.admin_global = true;
      else body.papel = novoPapel;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aprovar-usuario`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error ?? "Erro");
      return json;
    },
    onSuccess: (_, escolha) => {
      const label = PAPEIS_APROVACAO.find((p) => p.valor === escolha)?.label ?? escolha;
      toast.success(t("admin_usuarios.papel_atualizado", { papel: label }));
      qc.invalidateQueries();
    },
    onError: (err: Error) => toast.error(t("admin_usuarios.atualizar_falha"), { description: err.message }),
  });

  const [selecao, setSelecao] = useState<PapelTenant | "admin_global" | "">("");

  if (!perfil) {
    return (
      <Sheet open onOpenChange={() => onClose()}>
        <SheetContent side="right"><div className="pt-6 text-sm text-muted-foreground">{t("comum.carregando")}</div></SheetContent>
      </Sheet>
    );
  }

  const papelAtualLabel = perfil.admin_global ? t("admin_usuarios.papel_admin") : (papel ? labelPapel(papel) : t("admin_usuarios.sem_papel"));

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{perfil.nome}</SheetTitle>
          <SheetDescription>{perfil.email}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("admin_usuarios.papel_atual")}</span>
              {perfil.admin_global ? (
                <Badge variant="secondary" className="gap-1"><ShieldCheck className="h-3 w-3" />{papelAtualLabel}</Badge>
              ) : (
                <Badge variant="outline">{papelAtualLabel}</Badge>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("admin_usuarios.aprovado_em_lbl")}</span>
              <span>{formatarData(perfil.aprovado_em, idioma)}</span>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">{t("admin_usuarios.mudar_papel")}</div>
            <div className="flex gap-2">
              <Select value={selecao || undefined} onValueChange={(v) => setSelecao(v as PapelTenant | "admin_global")}>
                <SelectTrigger className="flex-1"><SelectValue placeholder={t("admin_usuarios.escolher_novo_papel")} /></SelectTrigger>
                <SelectContent>
                  {PAPEIS_APROVACAO.map((p) => (
                    <SelectItem key={p.valor} value={p.valor}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!selecao || mudarPapel.isPending}
                onClick={() => selecao && mudarPapel.mutate(selecao)}
              >
                {mudarPapel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin_usuarios.aplicar")}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("admin_usuarios.papel_aplica_a_todos")}
            </p>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">{t("admin_usuarios.historico_titulo")}</div>
            {(logs?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">{t("admin_usuarios.nenhuma_acao")}</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {logs?.map((l) => (
                  <li key={l.id} className="flex items-start gap-2">
                    <span className="text-muted-foreground">{formatarData(l.criado_em, idioma)}</span>
                    <span className="font-mono">{l.acao}</span>
                    {l.motivo && <span className="text-muted-foreground italic">— {l.motivo}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-between text-xs">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/usuarios/$id" params={{ id: perfilId }}>
                <ExternalLink className="mr-1 h-3 w-3" />Página completa
              </Link>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
