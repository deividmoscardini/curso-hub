import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solicitacoes/")({
  head: () => ({
    meta: [{ title: "Solicitações — Calendário +A" }],
  }),
  component: SolicitacoesPlaceholder,
});

function SolicitacoesPlaceholder() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Solicitações</h1>
        <p className="text-sm text-muted-foreground">
          Fluxo padronizado para pedir mudanças no calendário (gerar ano, nova oferta,
          ajuste de âncora, cancelar oferta).
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Em construção</CardTitle>
          </div>
          <CardDescription>
            O backend já está pronto: as edge functions <code>calcular-previa</code>,{" "}
            <code>preview-conflitos</code> e <code>aplicar-solicitacao</code> estão ativas.
            Falta a UI: formulário estruturado (aba/ano/curso/âncora), prévia visual ao
            vivo e diff antes de aprovar.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Enquanto isso, você pode ver o calendário atual em <a href="/calendario" className="underline">Calendário</a>{" "}
          e gerenciar produtos em <a href="/produtos" className="underline">Produtos</a>.
        </CardContent>
      </Card>
    </div>
  );
}
