import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início — Solicitação de Abertura de Cursos" },
      {
        name: "description",
        content:
          "Envie e acompanhe pedidos de abertura de novos cursos acadêmicos junto às instituições parceiras.",
      },
      { property: "og:title", content: "Solicitação de Abertura de Cursos" },
      {
        property: "og:description",
        content: "Envie e acompanhe pedidos de abertura de novos cursos acadêmicos.",
      },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/solicitacoes" });
  },
  component: Landing,
});

function Landing() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <GraduationCap className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
          Solicitação de Abertura de Cursos
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Plataforma interna para envio e aprovação de pedidos de abertura de novos cursos
          acadêmicos junto às instituições parceiras.
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link to="/auth">Entrar</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
