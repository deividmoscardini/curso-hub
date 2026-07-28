import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solicitacoes/$id")({
  head: () => ({ meta: [{ title: "Detalhe da solicitação" }] }),
  component: DetalheSolicitacao,
});

const statusVariant = {
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  rejeitado: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
} as const;

const diaLabel: Record<string, string> = {
  segunda: "Seg",
  terca: "Ter",
  quarta: "Qua",
  quinta: "Qui",
  sexta: "Sex",
  sabado: "Sáb",
};

function DetalheSolicitacao() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const { data: perfil } = useQuery({
    queryKey: ["perfil", user.id],
    queryFn: async () =>
      (await supabase.from("perfis").select("*").eq("id", user.id).maybeSingle()).data,
  });
  const isAprovador = perfil?.papel === "aprovador";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["solicitacao", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_abertura_curso")
        .select(
          "*, disciplinas_solicitadas(*), solicitante:perfis!solicitacoes_abertura_curso_solicitante_id_fkey(nome, email, area, tipo_area)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const aprovar = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("solicitacoes_abertura_curso")
      .update({
        status: "aprovado",
        aprovado_por: user.id,
        aprovado_em: new Date().toISOString(),
        motivo_rejeicao: null,
      })
      .eq("id", id);
    setBusy(false);
    if (error) {
      toast.error("Erro ao aprovar", { description: error.message });
      return;
    }
    toast.success("Solicitação aprovada");
    qc.invalidateQueries();
    refetch();
  };

  const rejeitar = async () => {
    if (!motivo.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("solicitacoes_abertura_curso")
      .update({
        status: "rejeitado",
        aprovado_por: user.id,
        aprovado_em: new Date().toISOString(),
        motivo_rejeicao: motivo.trim(),
      })
      .eq("id", id);
    setBusy(false);
    if (error) {
      toast.error("Erro ao rejeitar", { description: error.message });
      return;
    }
    toast.success("Solicitação rejeitada");
    setMotivo("");
    qc.invalidateQueries();
    refetch();
  };

  const baixarArquivo = async () => {
    if (!data?.arquivo_url) return;
    const { data: signed, error } = await supabase.storage
      .from("solicitacoes-arquivos")
      .createSignedUrl(data.arquivo_url, 60);
    if (error || !signed) {
      toast.error("Erro ao gerar link", { description: error?.message });
      return;
    }
    window.open(signed.signedUrl, "_blank");
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Solicitação não encontrada.</p>;

  const disciplinas = data.disciplinas_solicitadas ?? [];
  const solicitante = data.solicitante as {
    nome: string;
    email: string;
    area: string;
    tipo_area: string;
  } | null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/solicitacoes">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">{data.nome_curso}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{data.instituicao}</p>
          </div>
          <Badge
            variant="outline"
            className={statusVariant[data.status as keyof typeof statusVariant]}
          >
            {data.status}
          </Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <Info label="Solicitante" value={solicitante?.nome ?? data.nome_solicitante} />
          <Info label="E-mail" value={solicitante?.email ?? data.email_solicitante} />
          {solicitante && (
            <>
              <Info label="Área" value={solicitante.area || "—"} />
              <Info label="Tipo de área" value={solicitante.tipo_area} />
            </>
          )}
          <Info
            label="Enviado em"
            value={new Date(data.criado_em).toLocaleString("pt-BR")}
          />
          {data.aprovado_em && (
            <Info
              label={data.status === "aprovado" ? "Aprovado em" : "Rejeitado em"}
              value={new Date(data.aprovado_em).toLocaleString("pt-BR")}
            />
          )}
          {data.justificativa && (
            <div className="md:col-span-2">
              <Info label="Justificativa" value={data.justificativa} />
            </div>
          )}
          {data.motivo_rejeicao && (
            <div className="md:col-span-2">
              <Info label="Motivo da rejeição" value={data.motivo_rejeicao} />
            </div>
          )}
          {data.arquivo_url && (
            <div className="md:col-span-2">
              <Label className="text-xs font-medium">Arquivo anexado</Label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm">{data.arquivo_nome_original}</span>
                <Button variant="outline" size="sm" onClick={baixarArquivo}>
                  <Download className="mr-1 h-3 w-3" /> Baixar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disciplinas ({disciplinas.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>CH</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cap. início</TableHead>
                <TableHead>Cap. dias</TableHead>
                <TableHead>Cap. fim</TableHead>
                <TableHead>Aulas</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Lives</TableHead>
                <TableHead>Sem. live</TableHead>
                <TableHead>Dia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disciplinas
                .slice()
                .sort((a: any, b: any) => a.sequencia_oferta - b.sequencia_oferta)
                .map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.sequencia_oferta}</TableCell>
                    <TableCell className="font-medium">{d.nome_disciplina}</TableCell>
                    <TableCell>{d.carga_horaria}</TableCell>
                    <TableCell className="text-xs">
                      {d.tipo === "com_pre_requisito" ? "com pré" : "sem pré"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(d.data_inicio_captacao).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>{d.duracao_captacao_dias}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(d.data_fim_captacao).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(d.data_inicio_aulas).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>{d.duracao_disciplina_dias}d</TableCell>
                    <TableCell>{d.dias_lives}</TableCell>
                    <TableCell>{d.semana_live}</TableCell>
                    <TableCell>{diaLabel[d.dia_semana_live] ?? d.dia_semana_live}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAprovador && data.status === "pendente" && (
        <Card>
          <CardHeader>
            <CardTitle>Decisão</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={aprovar} disabled={busy}>
              Aprovar
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" disabled={busy}>
                  Rejeitar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rejeitar solicitação</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  <Label>Motivo da rejeição</Label>
                  <Textarea
                    rows={4}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Descreva o motivo…"
                  />
                </div>
                <DialogFooter>
                  <Button variant="destructive" onClick={rejeitar} disabled={busy}>
                    Confirmar rejeição
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}
