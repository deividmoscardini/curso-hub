import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/aprovacao/")({
  head: () => ({ meta: [{ title: "Aprovação — Pendentes" }] }),
  beforeLoad: async ({ context }) => {
    const { data } = await supabase
      .from("perfis")
      .select("papel")
      .eq("id", (context as { user: { id: string } }).user.id)
      .maybeSingle();
    if (data?.papel !== "aprovador") throw redirect({ to: "/solicitacoes" });
  },
  component: Pendentes,
});

function Pendentes() {
  const { data, isLoading } = useQuery({
    queryKey: ["aprovacao-pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_abertura_curso")
        .select(
          "id, criado_em, nome_curso, instituicao, nome_solicitante, disciplinas_solicitadas(count)",
        )
        .eq("status", "pendente")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel de aprovação</h1>
          <p className="text-sm text-muted-foreground">Solicitações pendentes de decisão.</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/aprovacao/historico">Ver histórico</Link>
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Enviado em</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Instituição</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead className="text-center">Disciplinas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma solicitação pendente.
                </TableCell>
              </TableRow>
            )}
            {data?.map((s) => {
              const count = Array.isArray(s.disciplinas_solicitadas)
                ? (s.disciplinas_solicitadas[0] as { count: number } | undefined)?.count ?? 0
                : 0;
              return (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(s.criado_em).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-medium">{s.nome_curso}</TableCell>
                  <TableCell>{s.instituicao}</TableCell>
                  <TableCell>{s.nome_solicitante}</TableCell>
                  <TableCell className="text-center">{count}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    >
                      pendente
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm">
                      <Link to="/solicitacoes/$id" params={{ id: s.id }}>
                        Revisar
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
