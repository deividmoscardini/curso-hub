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
import { useT } from "@/contexts/i18n";

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

// Fase 12.9 — Detecta campo de data. Bug anterior: heuristica pegava
// "LIVE" na chave e classificava DIA DA SEMANA DA LIVE (texto tipo
// "QUINTA-FEIRA") como date picker. Correcao: lista explicita de
// chaves textuais + checa se valor atual e ISO date. Nunca inferir
// "campo de data" so pelo nome contendo LIVE/DATA/etc.
const CHAVES_TEXTO = new Set([
  "DIA DA SEMANA DA LIVE", "DIA DA SEMANA",
  "TIPO DE OFERTA", "ENTRADA CAPTAÇÃO",
  "ESCOLA", "SIGLA", "CURSO", "DISCIPLINA",
  "CÓD CURSO", "CÓD. DO CURSO", "CÓDIGO DA TURMA", "CÓDIGO DA TURMA ",
  "TURMA", "OFERTA",
  "OBSERVAÇÕES", "Nº CHAMADO - FRESHDESK",
]);
function ehCampoDeData(chave: string, valor: unknown): boolean {
  if (CHAVES_TEXTO.has(chave.trim())) return false;
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) return true;
  // Se valor esta vazio, olha o nome da chave — mas exclui campos textuais.
  if (!valor || valor === "") {
    const upper = chave.toUpperCase();
    if (upper.includes("DIA DA SEMANA") || upper.includes("TIPO") || upper.includes("OFERTA")) return false;
    if (upper.includes("DATA") || upper.includes("LIVE") || upper.includes("QUESTIONÁRIO") || upper.includes("CAPTAÇÃO") ||
        upper.includes("FECHAMENTO") || upper.includes("ENVIO") || upper.includes("PROVA") ||
        upper.includes("PROTOCOLOS") || upper.includes("ENCERRAMENTO") || upper.includes("BASE PRONTA") ||
        upper.includes("ENTREGA") || upper.includes("CORRE")) {
      return true;
    }
  }
  return false;
}

export function CalendarioEditModal({ linha, onClose, onSaved }: Props) {
  const { t } = useT();
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
    if (!motivo.trim()) { toast.error(t("solicitacao_nova.motivo_obrigatorio_toast") ?? "Motivo obrigatório"); return; }
    if (alterados.length === 0) { toast.error(t("admin_calendario.nenhum_alterado")); return; }

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
    if (error) { setPending(false); toast.error(t("solicitacao_nova.falha_criar"), { description: error.message }); return; }

    // Fase 12.16 — Propagacao do CODIGO DA TURMA pra outras linhas.
    // Bruna (18/set/2026): "sempre que houver uma alteracao no codigo
    // da turma, ajustar em todos os cursos". Regra: se admin alterou
    // um dos campos de codigo da turma, buscar todas as linhas em
    // calendario_linhas cujo dados tem o codigo ANTIGO e trocar pelo
    // NOVO. Cobre disciplinas compartilhadas tipo "C" que aparecem
    // em varios cursos com a mesma turma.
    const camposCodigoTurma = alterados.filter((c) => c.trim() === "CÓDIGO DA TURMA");
    let linhasPropagadas = 0;
    for (const campo of camposCodigoTurma) {
      const codigoAntigo = String((linha.dados as Record<string, unknown>)[campo] ?? "").trim();
      const codigoNovo = String(novosDados[campo] ?? "").trim();
      if (!codigoAntigo || !codigoNovo || codigoAntigo === codigoNovo) continue;

      // Busca outras linhas do MESMO tenant cujo dados contenha o codigo
      // antigo em qualquer variante de chave (com/sem trailing space).
      const { data: outras } = await supabase
        .from("calendario_linhas")
        .select("id, dados, comentarios")
        .eq("tenant_id", linha.tenant_id)
        .neq("id", linha.id)
        .or(`dados->>CÓDIGO DA TURMA .eq.${codigoAntigo},dados->>CÓDIGO DA TURMA.eq.${codigoAntigo}`);
      for (const outra of outras ?? []) {
        const dadosOutra = { ...(outra.dados as Record<string, unknown>) };
        let atualizou = false;
        for (const chaveCod of ["CÓDIGO DA TURMA ", "CÓDIGO DA TURMA"]) {
          if (String(dadosOutra[chaveCod] ?? "").trim() === codigoAntigo) {
            dadosOutra[chaveCod] = codigoNovo;
            atualizou = true;
          }
        }
        if (!atualizou) continue;
        const eventosOutra = [...(Array.isArray(outra.comentarios) ? outra.comentarios : []), {
          criado_em: new Date().toISOString(),
          autor_id: uid,
          motivo: `${motivo.trim()} (propagação automática do código da turma ${codigoAntigo} → ${codigoNovo})`,
          tipo: "admin_edit" as const,
          campo_alterado: campo,
          valor_anterior: codigoAntigo,
          valor_novo: codigoNovo,
        }];
        await supabase.from("calendario_linhas")
          .update({ dados: dadosOutra, comentarios: eventosOutra })
          .eq("id", outra.id);
        linhasPropagadas++;
      }
    }
    if (linhasPropagadas > 0) {
      toast.success(`Código da turma propagado em ${linhasPropagadas} outra(s) linha(s).`);
    }

    await supabase.from("log_auditoria").insert({
      tenant_id: linha.tenant_id, ator_id: uid,
      acao: "calendario.admin_edit", entidade: "calendario_linhas", entidade_id: linha.id,
      antes: linha.dados, depois: novosDados, motivo: motivo.trim(),
    });

    setPending(false);
    toast.success(t("admin_calendario.linha_atualizada", { n: alterados.length, s: alterados.length > 1 ? "s" : "" }));
    onSaved();
    onClose();
  }

  async function excluir() {
    if (!motivo.trim()) { toast.error(t("solicitacao_nova.motivo_obrigatorio_toast") ?? "Motivo obrigatório"); return; }
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
    if (error) { toast.error(t("solicitacao_nova.falha_criar"), { description: error.message }); return; }
    toast.success(t("admin_calendario.linha_excluida"));
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modo === "editar" ? t("admin_calendario.editar_titulo") : t("admin_calendario.excluir_titulo")}</DialogTitle>
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
              <div>{t("admin_calendario.excluir_aviso")}</div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("comum.motivo_obrigatorio")}</label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder={t("admin_calendario.motivo_placeholder")} />
        </div>

        <DialogFooter className="justify-between">
          {modo === "editar" ? (
            <Button variant="ghost" onClick={() => setModo("excluir")} className="text-red-600 hover:text-red-700 hover:bg-red-500/10">
              <Trash2 className="mr-1 h-4 w-4" />{t("admin_calendario.excluir_linha")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setModo("editar")} disabled={pending}>{t("admin_calendario.voltar_edicao")}</Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>{t("comum.cancelar")}</Button>
            {modo === "editar" ? (
              <Button onClick={salvar} disabled={pending || !motivo.trim() || alterados.length === 0}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("admin_calendario.salvar_com_n", { n: alterados.length })}
              </Button>
            ) : (
              <Button variant="destructive" onClick={excluir} disabled={pending || !motivo.trim()}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("admin_calendario.confirmar_exclusao")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
