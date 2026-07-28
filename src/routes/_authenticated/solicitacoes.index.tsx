import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solicitacoes/")({
  head: () => ({ meta: [{ title: "Minhas solicitações" }] }),
  component: MinhasSolicitacoes,
});

const statusVariant = {
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  rejeitado: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
} as const;

function MinhasSolicitacoes() {
  const { user } = Route.useRouteContext();

  const { data, isLoading } = useQuery({
    queryKey: ["minhas-solicitacoes", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_abertura_curso")
        .select("id, criado_em, nome_curso, instituicao, status, disciplinas_solicitadas(count)")
        .eq("solicitante_id", user.id)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Minhas solicitações</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos de abertura de cursos que você enviou.
          </p>
        </div>
        <Button asChild>
          <Link to="/solicitacoes/nova">
            <Plus className="mr-2 h-4 w-4" /> Nova solicitação
          </Link>
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Instituição</TableHead>
              <TableHead className="text-center">Disciplinas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhuma solicitação enviada ainda.
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
                    {new Date(s.criado_em).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-medium">{s.nome_curso}</TableCell>
                  <TableCell>{s.instituicao}</TableCell>
                  <TableCell className="text-center">{count}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusVariant[s.status as keyof typeof statusVariant]}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/solicitacoes/$id" params={{ id: s.id }}>
                        Detalhes
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
