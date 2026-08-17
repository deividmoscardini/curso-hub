// Fase 11.9 — Painel lateral (drawer) de filtros do calendário.
// Compõe os subcomponentes de FiltroCampo dentro de seções colapsáveis
// específicas por aba. Substitui os inputs "Filtrar…" que ficavam
// abaixo de cada header da tabela.

import { useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { AbaCalendario } from "@/lib/colunas-calendario";
import {
  DEFS_POR_ABA,
  extrairOpcoes,
  filtrosVazios,
  type FiltrosEstado,
  type SecaoFiltro,
} from "@/lib/calendario-filtros";
import {
  FiltroTexto,
  FiltroMultiSelect,
  FiltroRangeNumero,
  FiltroRangeData,
  FiltroSecao,
  useContadorSecao,
} from "./FiltroCampo";
import { useT } from "@/contexts/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aba: AbaCalendario;
  linhas: Array<{ dados: Record<string, unknown> }>;
  filtros: FiltrosEstado;
  onChange: (f: FiltrosEstado) => void;
}

// Ordem das seções + i18n key, por aba. Só aparecem seções que a aba
// tem defs para.
const SECOES_POR_ABA: Record<AbaCalendario, Array<{ chave: SecaoFiltro; i18n: string }>> = {
  disciplinas: [
    { chave: "identificacao", i18n: "calendario.filtros_secao_identificacao" },
    { chave: "captacao",      i18n: "calendario.filtros_secao_captacao" },
    { chave: "aulas",         i18n: "calendario.filtros_secao_aulas" },
    { chave: "marcos",        i18n: "calendario.filtros_secao_marcos" },
  ],
  projeto_aplicacao: [
    { chave: "identificacao", i18n: "calendario.filtros_secao_identificacao" },
    { chave: "aulas",         i18n: "calendario.filtros_secao_aulas" },
    { chave: "feedback",      i18n: "calendario.filtros_secao_feedback" },
    { chave: "entrega_final", i18n: "calendario.filtros_secao_entrega_final" },
  ],
  prova_substitutiva: [
    { chave: "identificacao", i18n: "calendario.filtros_secao_identificacao" },
    { chave: "prova",         i18n: "calendario.filtros_secao_prova" },
  ],
  fechamento: [
    { chave: "identificacao", i18n: "calendario.filtros_secao_identificacao" },
    { chave: "fechamento",    i18n: "calendario.filtros_secao_fechamento" },
  ],
};

export function CalendarioFiltrosDrawer({
  open,
  onOpenChange,
  aba,
  linhas,
  filtros,
  onChange,
}: Props) {
  const { t } = useT();
  const defs = DEFS_POR_ABA[aba];
  const secoes = SECOES_POR_ABA[aba];

  // Cache de opções distinct pra multi_select. Recalcula quando a
  // lista de linhas muda de identidade (ex: trocar de aba/ano).
  const opcoesPorChave = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const d of defs) {
      if (d.tipo === "multi_select") {
        map[d.chave] = extrairOpcoes(linhas, d.chave);
      }
    }
    return map;
  }, [defs, linhas]);

  const setTexto = (chave: string, v: string) =>
    onChange({ ...filtros, textos: { ...filtros.textos, [chave]: v } });
  const setMulti = (chave: string, v: string[]) =>
    onChange({ ...filtros, multis: { ...filtros.multis, [chave]: v } });
  const setNumero = (chave: string, v: { de?: number; ate?: number }) =>
    onChange({ ...filtros, numeros: { ...filtros.numeros, [chave]: v } });
  const setData = (chave: string, v: { de?: string; ate?: string }) =>
    onChange({ ...filtros, datas: { ...filtros.datas, [chave]: v } });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <SheetTitle>{t("calendario.filtros_titulo")}</SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(filtrosVazios())}
              className="h-7 text-xs"
            >
              {t("calendario.filtros_limpar_tudo")}
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {secoes.map((s, i) => (
            <SecaoConteudo
              key={s.chave}
              titulo={t(s.i18n)}
              secao={s.chave}
              defs={defs}
              filtros={filtros}
              onChangeTexto={setTexto}
              onChangeMulti={setMulti}
              onChangeNumero={setNumero}
              onChangeData={setData}
              opcoesPorChave={opcoesPorChave}
              defaultOpen={i === 0}
            />
          ))}
        </div>

        <div className="border-t p-3">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            {t("calendario.filtros_aplicar")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SecaoConteudo({
  titulo,
  secao,
  defs,
  filtros,
  onChangeTexto,
  onChangeMulti,
  onChangeNumero,
  onChangeData,
  opcoesPorChave,
  defaultOpen,
}: {
  titulo: string;
  secao: SecaoFiltro;
  defs: typeof DEFS_POR_ABA[AbaCalendario];
  filtros: FiltrosEstado;
  onChangeTexto: (k: string, v: string) => void;
  onChangeMulti: (k: string, v: string[]) => void;
  onChangeNumero: (k: string, v: { de?: number; ate?: number }) => void;
  onChangeData: (k: string, v: { de?: string; ate?: string }) => void;
  opcoesPorChave: Record<string, string[]>;
  defaultOpen: boolean;
}) {
  const daSecao = defs.filter((d) => d.secao === secao);
  const contador = useContadorSecao(secao, defs, filtros);
  if (daSecao.length === 0) return null;

  return (
    <FiltroSecao titulo={titulo} contadorAtivos={contador} defaultOpen={defaultOpen}>
      {daSecao.map((d) => {
        if (d.tipo === "texto") {
          return (
            <FiltroTexto
              key={d.chave}
              chave={d.chave}
              valor={filtros.textos[d.chave] ?? ""}
              onChange={(v) => onChangeTexto(d.chave, v)}
            />
          );
        }
        if (d.tipo === "multi_select") {
          return (
            <FiltroMultiSelect
              key={d.chave}
              chave={d.chave}
              opcoes={opcoesPorChave[d.chave] ?? []}
              valor={filtros.multis[d.chave] ?? []}
              onChange={(v) => onChangeMulti(d.chave, v)}
            />
          );
        }
        if (d.tipo === "range_numero") {
          return (
            <FiltroRangeNumero
              key={d.chave}
              chave={d.chave}
              valor={filtros.numeros[d.chave] ?? {}}
              onChange={(v) => onChangeNumero(d.chave, v)}
            />
          );
        }
        return (
          <FiltroRangeData
            key={d.chave}
            chave={d.chave}
            valor={filtros.datas[d.chave] ?? {}}
            onChange={(v) => onChangeData(d.chave, v)}
          />
        );
      })}
    </FiltroSecao>
  );
}
