// Fase 8 — Seletor de linha do calendário por código da turma.
// Compartilhado pelos 4 sub-forms de alteração de data.
// Digita código ou nome, seleciona → retorna a linha completa
// (com dados, chave_natural, ano) pro form pré-preencher.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Search } from "lucide-react";
import { normalizar } from "@/lib/similaridade";

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

export function SeletorCodigoTurma({
  tenantId,
  aba = "disciplinas",
  selecionada,
  onSelecionar,
  placeholder = "Digite código da turma ou nome da disciplina…",
}: Props) {
  const [query, setQuery] = useState("");
  const [aberto, setAberto] = useState(false);
  const [candidatos, setCandidatos] = useState<LinhaSelecionada[]>([]);
  const [carregando, setCarregando] = useState(false);

  const queryNorm = useMemo(() => normalizar(query.trim()), [query]);

  useEffect(() => {
    if (queryNorm.length < 2) {
      setCandidatos([]);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("calendario_linhas")
        .select("id, chave_natural, ano, ordem, dados")
        .eq("tenant_id", tenantId)
        .eq("aba", aba)
        .order("ano", { ascending: false })
        .limit(200);
      if (cancelado) return;
      const linhas = ((data ?? []) as LinhaSelecionada[]).filter((linha) => {
        const dados = linha.dados as Record<string, string | null>;
        const codigo = String(dados["CÓDIGO DA TURMA "] ?? dados["CÓDIGO DA TURMA"] ?? "");
        const disciplina = String(dados["DISCIPLINA"] ?? "");
        const curso = String(dados["CURSO"] ?? "");
        const blob = normalizar(`${codigo} ${disciplina} ${curso}`);
        return blob.includes(queryNorm);
      }).slice(0, 20);
      setCandidatos(linhas);
      setCarregando(false);
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [queryNorm, tenantId, aba]);

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
            <ul className="max-h-72 overflow-y-auto">
              {candidatos.map((linha) => {
                const dados = linha.dados as Record<string, string | null>;
                const codigo = String(dados["CÓDIGO DA TURMA "] ?? dados["CÓDIGO DA TURMA"] ?? "—");
                const disciplina = String(dados["DISCIPLINA"] ?? "");
                const curso = String(dados["CURSO"] ?? "");
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
                      <span className="font-mono text-xs">{codigo}</span>
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

      {selecionada && (
        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono">{String((selecionada.dados as Record<string, string>)["CÓDIGO DA TURMA "] ?? (selecionada.dados as Record<string, string>)["CÓDIGO DA TURMA"] ?? "")}</span>
            <span className="text-muted-foreground">Ano {selecionada.ano}</span>
          </div>
          <div className="font-medium">{String((selecionada.dados as Record<string, string>)["DISCIPLINA"] ?? "")}</div>
          <div className="text-muted-foreground">{String((selecionada.dados as Record<string, string>)["CURSO"] ?? "")}</div>
        </div>
      )}
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
