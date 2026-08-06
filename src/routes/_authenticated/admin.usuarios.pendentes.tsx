import { createFileRoute, redirect } from "@tanstack/react-router";

// Fase 6 — Rota descontinuada. Fila de pendentes foi integrada
// diretamente em /admin/usuarios (pendentes ficam no topo com botoes
// inline). Mantemos redir pra links salvos nao quebrarem.
export const Route = createFileRoute("/_authenticated/admin/usuarios/pendentes")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/usuarios", replace: true });
  },
  component: () => null,
});
