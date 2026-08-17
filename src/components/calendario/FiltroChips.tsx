// Fase 11.9 — Barra de chips com filtros ativos, exibida abaixo do
// header da página /calendario. Cada chip: nome curto do filtro +
// resumo do valor + X pra remover só esse. "Limpar tudo" ao lado.

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AbaCalendario } from "@/lib/colunas-calendario";
import { labelColuna } from "@/lib/colunas-calendario";
import {
  DEFS_POR_ABA,
  filtrosVazios,
  type FiltrosEstado,
} from "@/lib/calendario-filtros";
import { useT } from "@/contexts/i18n";

interface Props {
  aba: AbaCalendario;
  filtros: FiltrosEstado;
  onChange: (f: FiltrosEstado) => void;
}

/** yyyy-mm-dd → dd/mm/aaaa (sem `new Date` pra evitar fuso). */
function fmtData(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function resumoMulti(vs: string[]): string {
  if (vs.length <= 2) return vs.join(", ");
  return `${vs.slice(0, 2).join(", ")} +${vs.length - 2}`;
}

function resumoRangeNumero(v: { de?: number; ate?: number }): string {
  if (v.de != null && v.ate != null) return `${v.de}–${v.ate}`;
  if (v.de != null) return `≥ ${v.de}`;
  if (v.ate != null) return `≤ ${v.ate}`;
  return "";
}

function resumoRangeData(v: { de?: string; ate?: string }): string {
  if (v.de && v.ate) return `${fmtData(v.de)} – ${fmtData(v.ate)}`;
  if (v.de) return `≥ ${fmtData(v.de)}`;
  if (v.ate) return `≤ ${fmtData(v.ate)}`;
  return "";
}

export function FiltroChips({ aba, filtros, onChange }: Props) {
  const { t } = useT();
  const defs = DEFS_POR_ABA[aba];
  const chavesConhecidas = new Set(defs.map((d) => d.chave));

  interface Chip {
    key: string;
    label: string;
    resumo: string;
    remover: () => void;
  }
  const chips: Chip[] = [];

  for (const [chave, valor] of Object.entries(filtros.textos)) {
    if (!chavesConhecidas.has(chave) || valor.trim() === "") continue;
    chips.push({
      key: `texto:${chave}`,
      label: labelColuna(chave),
      resumo: valor,
      remover: () =>
        onChange({
          ...filtros,
          textos: { ...filtros.textos, [chave]: "" },
        }),
    });
  }
  for (const [chave, valor] of Object.entries(filtros.multis)) {
    if (!chavesConhecidas.has(chave) || valor.length === 0) continue;
    chips.push({
      key: `multi:${chave}`,
      label: labelColuna(chave),
      resumo: resumoMulti(valor),
      remover: () =>
        onChange({
          ...filtros,
          multis: { ...filtros.multis, [chave]: [] },
        }),
    });
  }
  for (const [chave, valor] of Object.entries(filtros.numeros)) {
    if (!chavesConhecidas.has(chave) || (valor.de == null && valor.ate == null)) continue;
    chips.push({
      key: `numero:${chave}`,
      label: labelColuna(chave),
      resumo: resumoRangeNumero(valor),
      remover: () =>
        onChange({
          ...filtros,
          numeros: { ...filtros.numeros, [chave]: {} },
        }),
    });
  }
  for (const [chave, valor] of Object.entries(filtros.datas)) {
    if (!chavesConhecidas.has(chave) || (!valor.de && !valor.ate)) continue;
    chips.push({
      key: `data:${chave}`,
      label: labelColuna(chave),
      resumo: resumoRangeData(valor),
      remover: () =>
        onChange({
          ...filtros,
          datas: { ...filtros.datas, [chave]: {} },
        }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 p-2 text-xs">
      {chips.map((c) => (
        <Badge
          key={c.key}
          variant="secondary"
          className="gap-1 pr-1 font-normal"
        >
          <span className="text-muted-foreground">{c.label}:</span>
          <span className="font-medium">{c.resumo}</span>
          <button
            type="button"
            onClick={c.remover}
            className="rounded-sm p-0.5 hover:bg-background/60"
            aria-label={t("calendario.filtros_remover_chip")}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(filtrosVazios())}
        className="ml-auto h-6 gap-1 text-xs text-muted-foreground"
      >
        <X className="h-3 w-3" />
        {t("calendario.filtros_limpar_tudo")}
      </Button>
    </div>
  );
}
