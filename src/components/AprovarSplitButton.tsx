import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PAPEIS_APROVACAO } from "@/lib/papel-labels";
import type { PapelTenant } from "@/contexts/tenant";
import { useT } from "@/contexts/i18n";

// Fase 6.M2 — Split button de aprovação.
// Clique principal aprova como "visualizador" (default seguro).
// Dropdown ao lado permite escolher outro papel (Solicitante, Aprovador,
// Admin +A). Todo aprovado ganha membros em todos os tenants automaticamente
// via aprovar-usuario v2 no backend.
interface Props {
  perfilId: string;
  nome: string;
  onAprovado?: () => void;
}

type EscolhaPapel = PapelTenant | "admin_global";

async function chamarAprovar(perfilId: string, escolha: EscolhaPapel) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Sessão expirada");

  const body: Record<string, unknown> = { perfil_id: perfilId };
  if (escolha === "admin_global") {
    body.admin_global = true;
  } else {
    body.papel = escolha;
  }

  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aprovar-usuario`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!resp.ok || json.error) throw new Error(json.error ?? "Erro ao aprovar");
  return json;
}

export function AprovarSplitButton({ perfilId, nome, onAprovado }: Props) {
  const qc = useQueryClient();
  const { t } = useT();
  const [pendingKey, setPendingKey] = useState<EscolhaPapel | null>(null);

  const mut = useMutation({
    mutationFn: (escolha: EscolhaPapel) => chamarAprovar(perfilId, escolha),
    onMutate: (v) => setPendingKey(v),
    onSettled: () => setPendingKey(null),
    onSuccess: (_, escolha) => {
      const label = PAPEIS_APROVACAO.find((p) => p.valor === escolha)?.label ?? escolha;
      toast.success(t("admin_usuarios.aprovado_como", { nome, papel: label }));
      qc.invalidateQueries();
      onAprovado?.();
    },
    onError: (err: Error) => toast.error(t("admin_usuarios.aprovar_falha"), { description: err.message }),
  });

  const isLoading = mut.isPending;

  return (
    <div className="inline-flex">
      <Button
        size="sm"
        onClick={() => mut.mutate("visualizador")}
        disabled={isLoading}
        className="rounded-r-none border-r-0 pr-2"
      >
        {isLoading && pendingKey === "visualizador" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <><Check className="mr-1 h-4 w-4" />{t("comum.aprovar")}</>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            disabled={isLoading}
            className="rounded-l-none border-l border-l-primary-foreground/20 px-2"
            aria-label={t("admin_usuarios.escolher_papel")}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-2 py-1.5 text-[10px] uppercase text-muted-foreground">{t("admin_usuarios.aprovar_como_titulo")}</div>
          {PAPEIS_APROVACAO.map((p) => (
            <DropdownMenuItem
              key={p.valor}
              disabled={isLoading}
              onClick={() => mut.mutate(p.valor)}
              className="flex-col items-start gap-0.5"
            >
              <div className="flex w-full items-center gap-2 text-sm">
                {p.valor === "admin_global" && <ShieldCheck className="h-3.5 w-3.5" />}
                <span className="font-medium">{p.label}</span>
                {p.valor === "visualizador" && (
                  <span className="ml-auto text-[10px] text-muted-foreground">{t("admin_usuarios.default_lbl")}</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">{p.descricao}</div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 py-1 text-[10px] text-muted-foreground">
            {t("admin_usuarios.acesso_automatico")}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
