// Fase 9 — i18n leve. Context + Provider + hook useT().
// Sem dependência externa: dicionários TS puros, escolha em
// localStorage. Chaves inexistentes caem em fallback (PT), depois na
// própria chave (defensivo — evita tela em branco).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { pt, type Dicionario } from "@/lib/i18n/pt";
import { es } from "@/lib/i18n/es";

export type Idioma = "pt" | "es";

interface I18nContextValue {
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
  t: (chave: string, params?: Record<string, string | number>) => string;
}

const DICIONARIOS: Record<Idioma, Dicionario> = { pt, es };
const STORAGE_KEY = "curso-hub:idioma";

const I18nContext = createContext<I18nContextValue | null>(null);

/** Resolve chave "a.b.c" no objeto — retorna string ou null. */
function resolver(dicionario: Dicionario, chave: string): string | null {
  const partes = chave.split(".");
  let atual: unknown = dicionario;
  for (const p of partes) {
    if (atual && typeof atual === "object" && p in (atual as Record<string, unknown>)) {
      atual = (atual as Record<string, unknown>)[p];
    } else {
      return null;
    }
  }
  return typeof atual === "string" ? atual : null;
}

function interpolar(tmpl: string, params?: Record<string, string | number>): string {
  if (!params) return tmpl;
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdiomaState] = useState<Idioma>(() => {
    if (typeof window === "undefined") return "pt";
    const salvo = window.localStorage.getItem(STORAGE_KEY);
    if (salvo === "pt" || salvo === "es") return salvo;
    // Detecção do navegador (opcional): se começa com "es", vai pra ES.
    const nav = window.navigator.language?.toLowerCase() ?? "";
    return nav.startsWith("es") ? "es" : "pt";
  });

  const setIdioma = useCallback((i: Idioma) => {
    setIdiomaState(i);
    try { window.localStorage.setItem(STORAGE_KEY, i); } catch {
      // ignore quota errors — não é fatal
    }
  }, []);

  const t = useCallback(
    (chave: string, params?: Record<string, string | number>) => {
      const primario = resolver(DICIONARIOS[idioma], chave);
      if (primario !== null) return interpolar(primario, params);
      const fallback = resolver(pt, chave);
      if (fallback !== null) return interpolar(fallback, params);
      // Último recurso: retorna a chave (facilita achar strings faltando).
      return chave;
    },
    [idioma],
  );

  const value = useMemo(() => ({ idioma, setIdioma, t }), [idioma, setIdioma, t]);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = idioma;
  }, [idioma]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook principal. Chame no componente: `const { t, idioma, setIdioma } = useT()`.
 * Para uma única chave: `useT().t("comum.salvar")`.
 */
export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT precisa estar dentro de <I18nProvider>. Adicione no root da app.");
  return ctx;
}
