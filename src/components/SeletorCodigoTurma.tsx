// Fase 8 — Seletor de linha do calendário por código da turma.
// Compartilhado pelos 4 sub-forms de alteração de data.
// Digita código ou nome, seleciona → retorna a linha completa
// (com dados, chave_natural, ano) pro form pré-preencher.
//
// Fase 8.13:
// - Limit da query subiu de 200 → 2000 (base tem ~1.5k linhas por
//   aba; 200 pegava só o ano mais recente, escondendo turmas ativas
//   em anos anteriores).
// - Filtro "só turmas ativas" (default ON): considera ativa se
//   `DATA FIM` >= hoje OU se a linha ainda não tem data de fim
//   (campo vazio significa "motor ainda não rodou pra popular").
// - Cada resultado mostra o período (início → fim) ao lado do
//   código pra ajudar o usuário a identificar a turma certa quando
//   existem múltiplas homônimas em anos diferentes.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search } from "lucide-react";
import { normalizar } from "@/lib/similaridade";
import { useT } from "@/contexts/i18n";

export interface LinhaSelecionada {
  id: string;
  chave_natural: string;
  ano: number;
  ordem: number;
  dados: Record<string, unknown>;
}

interface Props {
  tenantId: string;
  aba?: "disciplinas" | "projeto_aplicacao" | "prova_substitutiva" | "fechamento";
  selecionada: LinhaSelecionada | null;
  onSelecionar: (linha: LinhaSelecionada) => void;
  placeholder?: string;
}

function dadosDeLinha(linha: LinhaSelecionada) {
  const d = linha.dados as Record<string, string | null>;
  return {
    codigo: String(d["CÓDIGO DA TURMA "] ?? d["CÓDIGO DA TURMA"] ?? "—"),
    disciplina: String(d["DISCIPLINA"] ?? ""),
    curso: String(d["CURSO"] ?? ""),
    inicio: (d["DATA  INÍCIO"] ?? d["DATA INÍCIO"] ?? null) as string | null,
    fim: (d["DATA FIM "] ?? d["DATA FIM"] ?? null) as string | null,
  };
}

// Ativa = tem `fim` no futuro OU `fim` ainda não preenchido (motor não
// rodou). Turma com fim no passado = concluída, some do filtro default.
function ehAtiva(fim: string | null, hojeISO: string): boolean {
  if (!fim || !fim.trim()) return true;
  return fim >= hojeISO;
}

export function SeletorCodigoTurma({
  tenantId,
  aba = "disciplinas",
  selecionada,
  onSelecionar,
  placeholder = "Digite código da turma ou nome da disciplina…",
}: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [aberto, setAberto] = useState(false);
  const [soAtivas, setSoAtivas] = useState(true);
  const [candidatos, setCandidatos] = useState<LinhaSelecionada[]>([]);
  const [carregando, setCarregando] = useState(false);

  const hojeISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const queryNorm = useMemo(() => normalizar(query.trim()), [query]);

  useEffect(() => {
    if (queryNorm.length < 2) {
      setCandidatos([]);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    const timer = setTimeout(async () => {
      // Traz todas as linhas da aba (base típica: ~1.5k por aba, cabe).
      // Filtro por texto acontece client-side sobre código/disciplina/curso.
      const { data } = await supabase
        .from("calendario_linhas")
        .select("id, chave_natural, ano, ordem, dados")
        .eq("tenant_id", tenantId)
        .eq("aba", aba)
        .order("ano", { ascending: false })
        .limit(2000);
      if (cancelado) return;

      const filtradas = ((data ?? []) as LinhaSelecionada[]).filter((linha) => {
        const { codigo, disciplina, curso, fim } = dadosDeLinha(linha);
        if (soAtivas && !ehAtiva(fim, hojeISO)) return false;
        const blob = normalizar(`${codigo} ${disciplina} ${curso}`);
        return blob.includes(queryNorm);
      });

      // Ordenação: ativas antes de concluídas, depois ano decrescente.
      filtradas.sort((a, b) => {
        const fa = ehAtiva(dadosDeLinha(a).fim, hojeISO) ? 0 : 1;
        const fb = ehAtiva(dadosDeLinha(b).fim, hojeISO) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return b.ano - a.ano;
      });

      setCandidatos(filtradas.slice(0, 30));
      setCarregando(false);
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [queryNorm, tenantId, aba, soAtivas, hojeISO]);

  return (
    <div className="space-y-2">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setAberto(true); }}
              onFocus={() => setAberto(true)}
              placeholder={placeholder}
              className="pl-8"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <label className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs cursor-pointer">
            <Checkbox checked={soAtivas} onCheckedChange={(v) => setSoAtivas(!!v)} />
            <div className="flex-1">
              <div className="font-medium">{t("solicitacao_nova.seletor_so_ativas")}</div>
              <div className="text-[10px] text-muted-foreground">{t("solicitacao_nova.seletor_so_ativas_desc")}</div>
            </div>
          </label>
          {carregando && (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </div>
          )}
          {!carregando && queryNorm.length < 2 && (
            <div className="p-3 text-sm text-muted-foreground">Digite ao menos 2 caracteres.</div>
          )}
          {!carregando && queryNorm.length >= 2 && candidatos.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">Nenhuma turma encontrada.</div>
          )}
          {!carregando && candidatos.length > 0 && (
            <ul className="max-h-80 overflow-y-auto">
              {candidatos.map((linha) => {
                const { codigo, disciplina, curso, inicio, fim } = dadosDeLinha(linha);
                const ativa = ehAtiva(fim, hojeISO);
                return (
                  <li key={linha.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        onSelecionar(linha);
                        setQuery(`${codigo} — ${disciplina}`);
                        setAberto(false);
                      }}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-mono text-xs">{codigo}</span>
                        {inicio && fim ? (
                          <span className={`text-[10px] ${ativa ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                            {t("solicitacao_nova.seletor_periodo", { inicio, fim })}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">
                            {t("solicitacao_nova.seletor_sem_periodo")}
                          </span>
                        )}
                      </div>
                      <span className="font-medium">{disciplina}</span>
                      <span className="text-xs text-muted-foreground">{curso} · {linha.ano}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      {selecionada && (() => {
        const { codigo, disciplina, curso, inicio, fim } = dadosDeLinha(selecionada);
        return (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-mono">{codigo}</span>
              {inicio && fim ? (
                <span className="text-muted-foreground">
                  {t("solicitacao_nova.seletor_periodo", { inicio, fim })}
                </span>
              ) : (
                <span className="text-muted-foreground">Ano {selecionada.ano}</span>
              )}
            </div>
            <div className="font-medium">{disciplina}</div>
            <div className="text-muted-foreground">{curso}</div>
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Helpers de leitura das chaves reais do jsonb `dados` — nomes vieram do
 * import da planilha e têm variações (espaço duplo, trailing space). Manter
 * numa única fonte pra não espalhar as concatenações pelo código.
 */
export const CAMPO = {
  codigoTurma: (d: Record<string, unknown>) =>
    String(d["CÓDIGO DA TURMA "] ?? d["CÓDIGO DA TURMA"] ?? ""),
  disciplina: (d: Record<string, unknown>) => String(d["DISCIPLINA"] ?? ""),
  curso: (d: Record<string, unknown>) => String(d["CURSO"] ?? ""),
  inicio: (d: Record<string, unknown>) =>
    (d["DATA  INÍCIO"] ?? d["DATA INÍCIO"] ?? null) as string | null,
  fim: (d: Record<string, unknown>) =>
    (d["DATA FIM "] ?? d["DATA FIM"] ?? null) as string | null,
  correcao: "QUESTIONÁRIO (SEMANA 4)",
  termino: "DATA FIM ",
} as const;

/** Retorna todos os campos "LIVE ..." presentes no `dados` da linha. */
export function livesDaLinha(dados: Record<string, unknown>): Array<{ campo: string; label: string; valor: string | null }> {
  return Object.keys(dados)
    .filter((k) => k.toUpperCase().startsWith("LIVE"))
    .map((k) => ({ campo: k, label: k, valor: (dados[k] as string | null) ?? null }));
}
