import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Roda so no client: no server nao temos localStorage/session, entao SSR
// dessa rota sempre daria em branco esperando o session resolver. Marcando
// ssr:false, o TanStack Router pula o pre-render e a decisao acontece no
// client, onde temos como saber se o usuario esta logado.
export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Calendário +A" }],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/calendario" });
    throw redirect({ to: "/auth" });
  },
  component: RedirectFallback,
});

// Fallback caso a rota renderize por algum motivo (ex.: session lookup lento).
// Redireciona no client via useEffect e mostra um spinner enquanto isso.
function RedirectFallback() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      window.location.replace(data.session ? "/calendario" : "/auth");
    });
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-sm text-muted-foreground">Carregando…</div>
    </main>
  );
}
