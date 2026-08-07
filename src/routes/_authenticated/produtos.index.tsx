import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileSpreadsheet, Upload, Loader2 } from "lucide-react";
import { useT } from "@/contexts/i18n";

export const Route = createFileRoute("/_authenticated/produtos/")({
  head: () => ({
    meta: [{ title: "Produtos — Calendário +A" }],
  }),
  component: ProdutosPage,
});

interface Tenant {
  id: string;
  slug: string;
  nome: string;
  brand_slug: string;
  descricao: string | null;
}

interface ContagemTenant {
  tenant_id: string;
  cursos: number;
  disciplinas: number;
  linhas: number;
}

async function contagens(tenantIds: string[]): Promise<ContagemTenant[]> {
  if (tenantIds.length === 0) return [];
  const [{ data: cursos }, { data: discs }, { data: linhas }] = await Promise.all([
    supabase.from("cursos").select("tenant_id").in("tenant_id", tenantIds),
    supabase.from("disciplinas").select("tenant_id").in("tenant_id", tenantIds),
    supabase.from("calendario_linhas").select("tenant_id").in("tenant_id", tenantIds),
  ]);
  const conta = (arr: { tenant_id: string }[] | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of arr ?? []) m.set(r.tenant_id, (m.get(r.tenant_id) ?? 0) + 1);
    return m;
  };
  const c = conta(cursos), d = conta(discs), l = conta(linhas);
  return tenantIds.map((id) => ({
    tenant_id: id,
    cursos: c.get(id) ?? 0,
    disciplinas: d.get(id) ?? 0,
    linhas: l.get(id) ?? 0,
  }));
}

function ProdutosPage() {
  const qc = useQueryClient();
  const { perfil, loading } = useTenant();
  const { t } = useT();

  const { data: tenants } = useQuery({
    queryKey: ["tenants-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, slug, nome, brand_slug, descricao")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Tenant[];
    },
  });

  const { data: cont } = useQuery({
    queryKey: ["tenants-contagens", (tenants ?? []).map((t) => t.id).join(",")],
    queryFn: () => contagens((tenants ?? []).map((t) => t.id)),
    enabled: !!tenants && tenants.length > 0,
  });

  if (loading) {
    return (
      <div className="max-w-2xl">
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("comum.carregando")}</CardContent></Card>
      </div>
    );
  }
  if (!perfil?.admin_global) {
    return (
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t("comum.sem_acesso")}</CardTitle>
            <CardDescription>{t("produtos.sem_acesso_desc")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("produtos.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("produtos.subtitulo_produtos")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tenants?.map((tenant) => {
          const c = cont?.find((x) => x.tenant_id === tenant.id);
          return (
            <Card key={tenant.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>{tenant.nome}</span>
                  <Badge variant="outline" className="text-[10px]">{tenant.brand_slug}</Badge>
                </CardTitle>
                {tenant.descricao && (
                  <CardDescription className="line-clamp-2">{tenant.descricao}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label={t("produtos.stat_cursos")} value={c?.cursos ?? 0} />
                  <Stat label={t("produtos.stat_disciplinas")} value={c?.disciplinas ?? 0} />
                  <Stat label={t("produtos.stat_linhas")} value={c?.linhas ?? 0} />
                </div>
                <ImportarPlanilha tenantId={tenant.id} onDone={() => qc.invalidateQueries()} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="text-lg font-semibold">{value.toLocaleString()}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function ImportarPlanilha({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const { t } = useT();

  const mut = useMutation({
    mutationFn: async (file: File) => {
      setProgresso(t("produtos.lendo_arquivo"));
      const buf = await file.arrayBuffer();
      // Converte pra base64
      const bytes = new Uint8Array(buf);
      let bin = "";
      const CHUNK = 32768;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      const base64 = btoa(bin);

      setProgresso(t("produtos.enviando_arquivo"));
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/importar-planilha`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "content-type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ tenant_id: tenantId, arquivo_base64: base64 }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error ?? "Erro ao importar");
      return json;
    },
    onSuccess: (data) => {
      const r = data.resumo;
      toast.success(t("produtos.planilha_importada"), {
        description: t("produtos.contagens", { cursos: r.cursos, disciplinas: r.disciplinas, linhas: r.calendario_linhas }),
      });
      setProgresso(null);
      onDone();
    },
    onError: (err: Error) => {
      toast.error(t("produtos.planilha_erro"), { description: err.message });
      setProgresso(null);
    },
  });

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mut.mutate(file);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={mut.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {mut.isPending ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{progresso ?? t("produtos.importando")}</>
        ) : (
          <><Upload className="mr-2 h-4 w-4" />{t("produtos.botao_importar")}</>
        )}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        <FileSpreadsheet className="mr-1 inline h-3 w-3" />
        {t("produtos.dica_importar")}
      </p>
    </div>
  );
}
