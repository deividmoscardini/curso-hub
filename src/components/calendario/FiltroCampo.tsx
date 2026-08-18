// Fase 11.9 — Subcomponentes de campo de filtro por tipo.
// Usados dentro de CalendarioFiltrosDrawer. Cada um recebe o valor
// atual + onChange e não sabe de estado global.

import { useMemo, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { labelColuna } from "@/lib/colunas-calendario";
import { useT } from "@/contexts/i18n";

interface CampoProps {
  chave: string;
}

/* ---------- Texto ---------- */

export function FiltroTexto({
  chave,
  valor,
  onChange,
  correspondencias,
}: CampoProps & {
  valor: string;
  onChange: (v: string) => void;
  /**
   * Fase 11.12 — Número de linhas que batem apenas com esse texto (ignorando
   * outros filtros). Se undefined ou input vazio, nada é mostrado. Se 0,
   * mostra em cor de alerta pra deixar claro que não achou nada.
   */
  correspondencias?: number;
}) {
  const { t } = useT();
  const mostrarContador = valor.trim() !== "" && correspondencias != null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          {labelColuna(chave)}
        </label>
        {mostrarContador && (
          <span
            className={
              correspondencias === 0
                ? "text-[10px] font-medium text-destructive"
                : "text-[10px] text-muted-foreground"
            }
          >
            {correspondencias === 1
              ? t("calendario.filtro_texto_1_correspondencia")
              : t("calendario.filtro_texto_n_correspondencias", { n: String(correspondencias) })}
          </span>
        )}
      </div>
      <Input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("calendario.filtro_texto_placeholder")}
        className="h-8 text-sm"
      />
    </div>
  );
}

/* ---------- Multi-select ---------- */

export function FiltroMultiSelect({
  chave,
  opcoes,
  valor,
  onChange,
}: CampoProps & {
  opcoes: string[];
  valor: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const toggle = (opt: string) => {
    if (valor.includes(opt)) onChange(valor.filter((v) => v !== opt));
    else onChange([...valor, opt]);
  };

  const resumo =
    valor.length === 0
      ? t("calendario.filtro_multi_placeholder")
      : valor.length <= 2
        ? valor.join(", ")
        : `${valor.slice(0, 2).join(", ")} +${valor.length - 2}`;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {labelColuna(chave)}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            className={cn(
              "h-8 w-full justify-between text-left font-normal",
              valor.length === 0 && "text-muted-foreground",
            )}
          >
            <span className="truncate">{resumo}</span>
            <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={t("calendario.filtro_multi_buscar")} className="h-9" />
            <CommandList>
              <CommandEmpty>{t("calendario.filtro_multi_vazio")}</CommandEmpty>
              <CommandGroup>
                {opcoes.map((opt) => {
                  const marcado = valor.includes(opt);
                  return (
                    <CommandItem
                      key={opt}
                      onSelect={() => toggle(opt)}
                      className="cursor-pointer"
                    >
                      <div
                        className={cn(
                          "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                          marcado
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {marcado && <Check className="h-3 w-3" />}
                      </div>
                      <span className="truncate">{opt}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          {valor.length > 0 && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={() => onChange([])}
              >
                {t("calendario.filtro_multi_limpar")}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {valor.length > 0 && (
        <div className="text-[10px] text-muted-foreground">
          {t("calendario.filtro_multi_contador", {
            n: String(valor.length),
            total: String(opcoes.length),
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Range numérico ---------- */

export function FiltroRangeNumero({
  chave,
  valor,
  onChange,
}: CampoProps & {
  valor: { de?: number; ate?: number };
  onChange: (v: { de?: number; ate?: number }) => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {labelColuna(chave)}
      </label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={valor.de ?? ""}
          onChange={(e) =>
            onChange({
              ...valor,
              de: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          placeholder={t("calendario.filtro_de")}
          className="h-8 text-sm"
        />
        <span className="text-xs text-muted-foreground">—</span>
        <Input
          type="number"
          value={valor.ate ?? ""}
          onChange={(e) =>
            onChange({
              ...valor,
              ate: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          placeholder={t("calendario.filtro_ate")}
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}

/* ---------- Range de data ---------- */

/**
 * Atalhos rápidos:
 * - Este ano: 1º de janeiro do ano atual até 31 de dezembro.
 * - Este mês: 1º dia do mês atual até último dia do mês atual.
 * - Próximos 30 dias: hoje até hoje+30.
 * Retorna strings ISO (yyyy-mm-dd) para bater com o formato do jsonb.
 */
function calcularAtalho(tipo: "ano" | "mes" | "30dias"): {
  de: string;
  ate: string;
} {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (tipo === "ano") {
    return { de: `${y}-01-01`, ate: `${y}-12-31` };
  }
  if (tipo === "mes") {
    const primeiro = new Date(y, m, 1);
    const ultimo = new Date(y, m + 1, 0);
    return { de: iso(primeiro), ate: iso(ultimo) };
  }
  const daqui30 = new Date();
  daqui30.setDate(hoje.getDate() + 30);
  return { de: iso(hoje), ate: iso(daqui30) };
}

export function FiltroRangeData({
  chave,
  valor,
  onChange,
}: CampoProps & {
  valor: { de?: string; ate?: string };
  onChange: (v: { de?: string; ate?: string }) => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {labelColuna(chave)}
      </label>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={valor.de ?? ""}
          onChange={(e) =>
            onChange({
              ...valor,
              de: e.target.value === "" ? undefined : e.target.value,
            })
          }
          className="h-8 text-sm"
        />
        <span className="text-xs text-muted-foreground">—</span>
        <Input
          type="date"
          value={valor.ate ?? ""}
          onChange={(e) =>
            onChange({
              ...valor,
              ate: e.target.value === "" ? undefined : e.target.value,
            })
          }
          className="h-8 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => onChange(calcularAtalho("ano"))}
        >
          {t("calendario.filtro_atalho_este_ano")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => onChange(calcularAtalho("mes"))}
        >
          {t("calendario.filtro_atalho_este_mes")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => onChange(calcularAtalho("30dias"))}
        >
          {t("calendario.filtro_atalho_proximos_30")}
        </Button>
      </div>
    </div>
  );
}

/* ---------- Seção colapsável ---------- */

export function FiltroSecao({
  titulo,
  contadorAtivos,
  defaultOpen = false,
  children,
}: {
  titulo: string;
  contadorAtivos: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t first:border-t-0">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-medium">
          {titulo}
          {contadorAtivos > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {contadorAtivos}
            </Badge>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/* ---------- Utility: contagem de filtros ativos por seção ---------- */

/**
 * Dada uma seção e a lista de defs, conta quantos filtros dessa seção
 * estão preenchidos no estado. Usado no header colapsável pra mostrar
 * o badge "(2)".
 */
export function useContadorSecao(
  secao: string,
  defs: Array<{ chave: string; secao: string; tipo: string }>,
  filtros: {
    textos: Record<string, string>;
    multis: Record<string, string[]>;
    numeros: Record<string, { de?: number; ate?: number }>;
    datas: Record<string, { de?: string; ate?: string }>;
  },
) {
  return useMemo(() => {
    let n = 0;
    for (const d of defs.filter((x) => x.secao === secao)) {
      if (d.tipo === "texto" && (filtros.textos[d.chave] ?? "").trim() !== "") n++;
      if (d.tipo === "multi_select" && (filtros.multis[d.chave]?.length ?? 0) > 0) n++;
      if (
        d.tipo === "range_numero" &&
        (filtros.numeros[d.chave]?.de != null || filtros.numeros[d.chave]?.ate != null)
      )
        n++;
      if (
        d.tipo === "range_data" &&
        (filtros.datas[d.chave]?.de || filtros.datas[d.chave]?.ate)
      )
        n++;
    }
    return n;
  }, [secao, defs, filtros]);
}
