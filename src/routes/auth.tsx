import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import { useT } from "@/contexts/i18n";
import { SeletorIdioma } from "@/components/SeletorIdioma";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Solicitação de Abertura de Cursos" },
      { name: "description", content: "Faça login ou crie sua conta na plataforma." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/calendario" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/calendario" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      toast.error(t("auth.nao_foi_possivel_entrar"), { description: error.message });
      return;
    }
    navigate({ to: "/calendario" });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(t("auth.nao_foi_possivel_cadastrar"), { description: error.message });
      return;
    }
    toast.success(t("auth.conta_criada"));
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="absolute right-4 top-4">
        <SeletorIdioma variant="ghost" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-xl font-semibold">{t("auth.titulo")}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("auth.entrar")}</CardTitle>
            <CardDescription>{t("auth.dominio_restrito")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="entrar">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="entrar">{t("auth.ja_tem_conta")}</TabsTrigger>
                <TabsTrigger value="cadastrar">{t("auth.cadastrar")}</TabsTrigger>
              </TabsList>

              <TabsContent value="entrar" className="space-y-4 pt-4">
                <form onSubmit={handleLogin} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="senha">{t("auth.senha")}</Label>
                    <Input id="senha" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t("auth.entrando") : t("auth.entrar")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="cadastrar" className="space-y-4 pt-4">
                <form onSubmit={handleSignup} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="nome-cad">{t("auth.nome")}</Label>
                    <Input id="nome-cad" required value={nome} onChange={(e) => setNome(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-cad">{t("auth.email")}</Label>
                    <Input id="email-cad" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="senha-cad">{t("auth.senha")}</Label>
                    <Input id="senha-cad" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t("auth.cadastrando") : t("auth.cadastrar")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
