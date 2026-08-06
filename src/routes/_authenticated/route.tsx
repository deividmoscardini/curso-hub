import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FileText, Package, ScrollText, LogOut, Users, Inbox } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TenantContext, type Perfil, type PapelTenant, type Membro } from "@/contexts/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, XCircle } from "lucide-react";
export { useTenant } from "@/contexts/tenant";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: perfil, isLoading: perfilLoading } = useQuery({
    queryKey: ["perfil", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome, email, admin_global, status, motivo_rejeicao")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Perfil | null;
    },
  });

  const { data: membros, isLoading: membrosLoading } = useQuery({
    queryKey: ["membros", user.id],
    queryFn: async () => {
      // admin_global vê todos os tenants; membro comum vê os seus
      if (perfil?.admin_global) {
        const { data, error } = await supabase
          .from("tenants")
          .select("id, slug, nome, brand_slug")
          .order("nome");
        if (error) throw error;
        return (data ?? []).map((t) => ({
          tenant_id: t.id, papel: "owner" as PapelTenant, tenants: t,
        }));
      }
      const { data, error } = await supabase
        .from("membros")
        .select("tenant_id, papel, tenants(id, slug, nome, brand_slug)")
        .eq("perfil_id", user.id);
      if (error) throw error;
      return (data ?? []) as unknown as Membro[];
    },
    enabled: perfil !== undefined,
  });

  const [tenantId, setTenantId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("tenantId");
  });

  useEffect(() => {
    if (!tenantId && membros && membros.length > 0) {
      const first = membros[0].tenant_id;
      setTenantId(first);
      localStorage.setItem("tenantId", first);
    }
  }, [tenantId, membros]);

  const membroAtual = membros?.find((m) => m.tenant_id === tenantId) ?? null;
  const papel = membroAtual?.papel ?? null;

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    localStorage.removeItem("tenantId");
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");
  const podeEditar = perfil?.admin_global || ["owner", "editor"].includes(papel ?? "");
  const podeSolicitar = perfil?.admin_global || !!papel;

  // Guard de status: pendente ou rejeitado nao acessa nada.
  // admin_global bypassa (evita cadeado se algum dia tudo travar).
  if (perfil && !perfil.admin_global && perfil.status !== "aprovado") {
    return <StatusBloqueio perfil={perfil} onSignOut={handleSignOut} />;
  }

  return (
    <TenantContext.Provider value={{ tenantId, tenants: membros ?? [], perfil: perfil ?? null, papel, loading: perfilLoading || membrosLoading }}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <Sidebar collapsible="icon">
            <SidebarHeader>
              <div className="flex items-center gap-2 px-2 py-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div className="flex min-w-0 flex-col overflow-hidden">
                  <span className="truncate text-sm font-semibold">Calendário +A</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {perfil?.email ?? user.email}
                  </span>
                </div>
              </div>
              {(membros?.length ?? 0) > 0 && (
                <div className="px-2 pb-1">
                  <Select
                    value={tenantId ?? undefined}
                    onValueChange={(v) => {
                      setTenantId(v);
                      localStorage.setItem("tenantId", v);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecionar produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {membros?.map((m) => (
                        <SelectItem key={m.tenant_id} value={m.tenant_id}>
                          {m.tenants?.nome ?? m.tenant_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Calendário</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive("/calendario")}>
                        <Link to="/calendario">
                          <CalendarDays />
                          <span>Visão do calendário</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {podeSolicitar && (
                <SidebarGroup>
                  <SidebarGroupLabel>Fluxo</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={isActive("/solicitacoes")}>
                          <Link to="/solicitacoes">
                            <FileText />
                            <span>Solicitações</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              {(perfil?.admin_global || podeEditar) && (
                <SidebarGroup>
                  <SidebarGroupLabel>Administração</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={isActive("/produtos")}>
                          <Link to="/produtos">
                            <Package />
                            <span>Produtos</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {perfil?.admin_global && (
                        <>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive("/admin/usuarios")}>
                              <Link to="/admin/usuarios">
                                <Users />
                                <span>Usuários</span>
                                <PendentesBadge />
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive("/admin/solicitacoes")}>
                              <Link to="/admin/solicitacoes">
                                <Inbox />
                                <span>Fila de solicitações</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive("/auditoria")}>
                              <Link to="/auditoria">
                                <ScrollText />
                                <span>Auditoria</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </>
                      )}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}
            </SidebarContent>

            <SidebarFooter>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="justify-start">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-1 flex-col">
            <header className="flex h-12 items-center justify-between gap-2 border-b bg-background px-4">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div className="text-sm text-muted-foreground">
                  {perfil ? (
                    <span className="flex items-center gap-2">
                      {perfil.nome || perfil.email}
                      {perfil.admin_global && <Badge variant="secondary" className="text-[10px]">admin</Badge>}
                      {papel && !perfil.admin_global && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {papel.replace("_", " ")}
                        </Badge>
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            </header>
            <main className="flex-1 overflow-auto bg-muted/20 p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </TenantContext.Provider>
  );
}

// Fase 6.M6 — Badge numerico ao lado do link "Usuarios" quando ha
// pendentes de aprovacao. Substitui o banner "N aguardando aprovacao"
// que ficava no topo da /admin/usuarios.
function PendentesBadge() {
  const { data } = useQuery({
    queryKey: ["pendentes-count"],
    queryFn: async () => {
      const { count } = await supabase.from("perfis")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");
      return count ?? 0;
    },
    refetchInterval: 30000,
  });
  if (!data) return null;
  return <Badge variant="destructive" className="ml-auto text-[10px]">{data}</Badge>;
}

// Tela mostrada quando o user esta pendente/rejeitado — bloqueia todas as
// rotas autenticadas. Sair volta pra /auth.
function StatusBloqueio({ perfil, onSignOut }: { perfil: Perfil; onSignOut: () => void }) {
  const isPendente = perfil.status === "pendente";
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {isPendente ? <Clock className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
          </div>
          <CardTitle>
            {isPendente ? "Aguardando aprovação" : "Cadastro rejeitado"}
          </CardTitle>
          <CardDescription>
            {isPendente
              ? "Sua conta foi criada e aguarda a aprovação de um administrador. Você receberá acesso assim que for autorizado."
              : perfil.motivo_rejeicao
                ? `Motivo: ${perfil.motivo_rejeicao}`
                : "Entre em contato com o administrador da plataforma."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-center">
          <div className="text-xs text-muted-foreground">
            Você está logado como <span className="font-medium">{perfil.email}</span>.
          </div>
          <Button variant="outline" size="sm" onClick={onSignOut}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
