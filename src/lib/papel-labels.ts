// Fase 6.M5 — Mapping enum papel_tenant do banco -> label visual amigavel.
// Enum interno nao muda; so o rotulo mostrado na UI.
import type { PapelTenant } from "@/contexts/tenant";

export const PAPEL_LABEL: Record<PapelTenant, string> = {
  owner: "Dono do produto",
  aprovador: "Aprovador",
  editor: "Editor",
  solicitante_interno: "Solicitante",
  solicitante_externo: "Solicitante externo",
  visualizador: "Visualizador",
};

export const PAPEL_DESCRICAO: Record<PapelTenant, string> = {
  owner: "Gerencia o produto e todos os seus dados",
  aprovador: "Aprova e rejeita solicitações. Pode criar solicitações — mas o admin valida",
  editor: "Edita entidades direto (auditado)",
  solicitante_interno: "Cria solicitações e acompanha as próprias",
  solicitante_externo: "Cria solicitações (dados sensíveis ocultos)",
  visualizador: "Só lê calendário",
};

export function labelPapel(papel: PapelTenant | null | undefined, adminGlobal?: boolean): string {
  if (adminGlobal) return "Admin +A";
  if (!papel) return "—";
  return PAPEL_LABEL[papel] ?? papel;
}

// Papeis mostrados no split button "Aprovar como" (ordem = do menos ao
// mais poderoso). Owner nao aparece — decisao operacional fica pra depois.
export const PAPEIS_APROVACAO: Array<{ valor: PapelTenant | "admin_global"; label: string; descricao: string }> = [
  { valor: "visualizador", label: "Visualizador", descricao: "Só vê calendário (default)" },
  { valor: "solicitante_interno", label: "Solicitante", descricao: "Cria e acompanha pedidos" },
  { valor: "aprovador", label: "Aprovador", descricao: "Aprova pedidos (mas não os próprios)" },
  { valor: "admin_global", label: "Admin +A", descricao: "Acesso total à plataforma" },
];
