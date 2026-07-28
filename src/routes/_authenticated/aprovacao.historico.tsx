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

export const Route = createFileRoute("/_authenticated/aprovacao/historico")({
  head: () => ({ meta: [{ title: "Aprovação — Histórico" }] }),
  beforeLoad: async ({ context }) => {
    const { data } = await supabase
      .from("perfis")
      .select("papel")
      .eq("id", (context as { user: { id: string } }).user.id)
      .maybeSingle();
    if (data?.papel !== "aprovador") throw redirect({ to: "/solicitacoes" });
  },
  component: Historico,
});

const statusVariant = {
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  rejeitado: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
} as const;

function Historico() {
  const { data, isLoading } = useQuery({
    queryKey: ["aprovacao-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_abertura_curso")
        .select("id, criado_em, aprovado_em, nome_curso, instituicao, nome_solicitante, status")
        .in("status", ["aprovado", "rejeitado"])
        .order("aprovado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
          <p className="text-sm text-muted-foreground">Solicitações já decididas.</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/aprovacao">Pendentes</Link>
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Decidido em</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Instituição</TableHead>
              <TableHead>Solicitante</TableHead>
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
                  Nada no histórico ainda.
                </TableCell>
              </TableRow>
            )}
            {data?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {s.aprovado_em ? new Date(s.aprovado_em).toLocaleString("pt-BR") : "—"}
                </TableCell>
                <TableCell className="font-medium">{s.nome_curso}</TableCell>
                <TableCell>{s.instituicao}</TableCell>
                <TableCell>{s.nome_solicitante}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={statusVariant[s.status as keyof typeof statusVariant]}
                  >
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
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
