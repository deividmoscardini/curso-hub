import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
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
  // Fase 12.17 — toggle "ver senha" + reset via email
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [resetando, setResetando] = useState(false);

  async function handleResetSenha() {
    if (!email) {
      toast.error(t("auth.reset_precisa_email") ?? "Digite seu e-mail acima antes.");
      return;
    }
    setResetando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setResetando(false);
    if (error) {
      toast.error(t("auth.reset_falha") ?? "Não foi possível enviar", { description: error.message });
      return;
    }
    toast.success(t("auth.reset_enviado") ?? "Link de redefinição enviado", {
      description: t("auth.reset_enviado_desc") ?? `Verifique a caixa de entrada de ${email}.`,
    });
  }

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
          {/* Logo +A oficial (skill identidade-mais-a). Fundo da /auth é
              off white, então usa a versão fundo-claro. */}
          <img
            src="/brands/mais-a/logo-fundo-claro.png"
            alt="+A Educação"
            className="h-14 w-14"
          />
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="senha">{t("auth.senha")}</Label>
                      <button
                        type="button"
                        onClick={handleResetSenha}
                        disabled={resetando}
                        className="text-xs text-primary hover:underline disabled:opacity-50"
                      >
                        {resetando ? (t("auth.reset_enviando") ?? "Enviando…") : t("auth.esqueci_senha")}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="senha"
                        type={mostrarSenha ? "text" : "password"}
                        required
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha((v) => !v)}
                        aria-label={mostrarSenha ? t("auth.esconder_senha") ?? "Esconder" : t("auth.mostrar_senha") ?? "Mostrar"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
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
                    <div className="relative">
                      <Input
                        id="senha-cad"
                        type={mostrarSenha ? "text" : "password"}
                        required
                        minLength={6}
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha((v) => !v)}
                        aria-label={mostrarSenha ? t("auth.esconder_senha") ?? "Esconder" : t("auth.mostrar_senha") ?? "Mostrar"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
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
