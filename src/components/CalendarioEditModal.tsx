// Fase 8 — Modal de edição/exclusão administrativa de linha do
// calendário. Só admin_global chega aqui. Cada operação exige motivo
// e é gravada em: (a) coluna `comentarios` da linha (edit) ou log
// (delete), e (b) `log_auditoria`.

import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface LinhaEditavel {
  id: string;
  tenant_id: string;
  chave_natural: string;
  dados: Record<string, unknown>;
  comentarios: Array<Record<string, unknown>>;
}

interface Props {
  linha: LinhaEditavel;
  onClose: () => void;
  onSaved: () => void;
}

// Detecta campo de data (heurística): valor string ISO YYYY-MM-DD ou
// chave contendo DATA/LIVE/QUESTIONÁRIO/CAPTAÇÃO.
function ehCampoDeData(chave: string, valor: unknown): boolean {
  const upper = chave.toUpperCase();
  if (upper.includes("DATA") || upper.includes("LIVE") || upper.includes("QUESTIONÁRIO") || upper.includes("CAPTAÇÃO")) {
    return true;
  }
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) return true;
  return false;
}

export function CalendarioEditModal({ linha, onClose, onSaved }: Props) {
  const chaves = useMemo(() => Object.keys(linha.dados), [linha.dados]);
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(chaves.map((k) => [k, String((linha.dados as Record<string, unknown>)[k] ?? "")]))
  );
  const [motivo, setMotivo] = useState("");
  const [modo, setModo] = useState<"editar" | "excluir">("editar");
  const [pending, setPending] = useState(false);

  const alterados = chaves.filter((k) => {
    const original = String((linha.dados as Record<string, unknown>)[k] ?? "");
    return valores[k] !== original;
  });

  async function salvar() {
    if (!motivo.trim()) { toast.error("Motivo obrigatório"); return; }
    if (alterados.length === 0) { toast.error("Nenhum campo alterado"); return; }

    setPending(true);
    const { data: user } = await supabase.auth.getUser();
    const uid = user.user?.id;
    if (!uid) { setPending(false); toast.error("Sessão expirada"); return; }

    const novosDados = { ...linha.dados };
    const eventos = alterados.map((campo) => {
      const valor_anterior = (linha.dados as Record<string, unknown>)[campo];
      const valor_novo = valores[campo] === "" ? null : valores[campo];
      novosDados[campo] = valor_novo;
      return {
        criado_em: new Date().toISOString(),
        autor_id: uid,
        motivo: motivo.trim(),
        tipo: "admin_edit" as const,
        campo_alterado: campo,
        valor_anterior,
        valor_novo,
      };
    });
    const comentariosAtuais = Array.isArray(linha.comentarios) ? linha.comentarios : [];
    const comentarios = [...comentariosAtuais, ...eventos];

    const { error } = await supabase
      .from("calendario_linhas")
      .update({ dados: novosDados, comentarios })
      .eq("id", linha.id);
    if (error) { setPending(false); toast.error("Falha ao salvar", { description: error.message }); return; }

    await supabase.from("log_auditoria").insert({
      tenant_id: linha.tenant_id, ator_id: uid,
      acao: "calendario.admin_edit", entidade: "calendario_linhas", entidade_id: linha.id,
      antes: linha.dados, depois: novosDados, motivo: motivo.trim(),
    });

    setPending(false);
    toast.success(`Linha atualizada — ${alterados.length} campo${alterados.length > 1 ? "s" : ""}.`);
    onSaved();
    onClose();
  }

  async function excluir() {
    if (!motivo.trim()) { toast.error("Motivo obrigatório"); return; }
    setPending(true);
    const { data: user } = await supabase.auth.getUser();
    const uid = user.user?.id;
    if (!uid) { setPending(false); return; }

    await supabase.from("log_auditoria").insert({
      tenant_id: linha.tenant_id, ator_id: uid,
      acao: "calendario.admin_delete", entidade: "calendario_linhas", entidade_id: linha.id,
      antes: linha.dados, depois: null, motivo: motivo.trim(),
    });
    const { error } = await supabase.from("calendario_linhas").delete().eq("id", linha.id);
    setPending(false);
    if (error) { toast.error("Falha ao excluir", { description: error.message }); return; }
    toast.success("Linha excluída.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modo === "editar" ? "Editar linha do calendário" : "Excluir linha do calendário"}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{linha.chave_natural}</DialogDescription>
        </DialogHeader>

        {modo === "editar" ? (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-2">
            {chaves.map((k) => {
              const isData = ehCampoDeData(k, (linha.dados as Record<string, unknown>)[k]);
              const alterado = valores[k] !== String((linha.dados as Record<string, unknown>)[k] ?? "");
              return (
                <div key={k} className="grid grid-cols-3 items-center gap-3">
                  <label className="text-xs font-medium text-muted-foreground">{k}</label>
                  <div className="col-span-2">
                    <Input
                      type={isData ? "date" : "text"}
                      value={valores[k]}
                      onChange={(e) => setValores({ ...valores, [k]: e.target.value })}
                      className={alterado ? "border-amber-500 bg-amber-500/5" : ""}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>Ação irreversível. A linha some do calendário e do histórico visual — o registro fica só em log_auditoria.</div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Motivo *</label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Por que essa mudança administrativa? (Fica visível no calendário.)" />
        </div>

        <DialogFooter className="justify-between">
          {modo === "editar" ? (
            <Button variant="ghost" onClick={() => setModo("excluir")} className="text-red-600 hover:text-red-700 hover:bg-red-500/10">
              <Trash2 className="mr-1 h-4 w-4" />Excluir linha
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setModo("editar")} disabled={pending}>← Voltar pra edição</Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
            {modo === "editar" ? (
              <Button onClick={salvar} disabled={pending || !motivo.trim() || alterados.length === 0}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar {alterados.length > 0 && `(${alterados.length})`}
              </Button>
            ) : (
              <Button variant="destructive" onClick={excluir} disabled={pending || !motivo.trim()}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar exclusão
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
