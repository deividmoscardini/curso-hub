import { createContext, useContext } from "react";

export type PapelTenant =
  | "owner"
  | "aprovador"
  | "editor"
  | "solicitante_interno"
  | "solicitante_externo"
  | "visualizador";

export type StatusUsuario = "pendente" | "aprovado" | "rejeitado";

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  admin_global: boolean;
  status: StatusUsuario;
  motivo_rejeicao: string | null;
}

export interface Membro {
  tenant_id: string;
  papel: PapelTenant;
  tenants: { id: string; slug: string; nome: string; brand_slug: string } | null;
}

export interface TenantCtx {
  tenantId: string | null;
  tenants: Membro[];
  perfil: Perfil | null;
  papel: PapelTenant | null;
  loading: boolean;
}

// Modulo isolado do route.tsx pra garantir que so exista UMA instancia do
// contexto — se ficasse dentro de route.tsx, cada chunk de rota filha
// poderia acabar com sua propria copia por conta do code-splitting do
// TanStack Router / Vite.
export const TenantContext = createContext<TenantCtx>({
  tenantId: null,
  tenants: [],
  perfil: null,
  papel: null,
  loading: true,
});

export const useTenant = () => useContext(TenantContext);
