// Fase 12.1 — Helpers de formatação de data em pt-BR / es-ES.
//
// Motivo: hoje a tela do aprovador mostra datas em ISO cru
// ("2027-11-30") ou via toLocaleString() cujo formato depende do
// locale do BROWSER — usuários com Windows em en-US veem "11/30/2027",
// o que confunde a Bruna. Este módulo centraliza a formatação e
// respeita o IDIOMA da app (contexto i18n), não o do browser.

export type Idioma = "pt" | "es";

/**
 * Formata uma data ISO (yyyy-mm-dd) como dd/mm/aaaa.
 * Aceita também timestamp ISO (2026-08-18T15:12:34Z) — pega só a data.
 * Se o input for null/undefined/"" ou não bater no formato, devolve "—".
 *
 * Pt-BR e es-ES compartilham dd/mm/aaaa — a distinção fica no separador
 * ou label em outras chaves i18n; aqui é o mesmo output pros dois.
 */
export function formatarData(iso: unknown, _idioma: Idioma = "pt"): string {
  if (iso == null || iso === "") return "—";
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Formata um timestamp ISO como "dd/mm/aaaa hh:mm" no fuso local do
 * usuário (sem segundos). Se o input for uma data pura (yyyy-mm-dd),
 * cai no `formatarData`.
 *
 * Usa `Intl.DateTimeFormat` com locale explícito — não depende do
 * navegador nem passa por conversões string surpresas.
 */
export function formatarDataHora(iso: unknown, idioma: Idioma = "pt"): string {
  if (iso == null || iso === "") return "—";
  const s = String(iso);
  // yyyy-mm-dd sem hora — só a data.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatarData(s, idioma);
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const locale = idioma === "es" ? "es-ES" : "pt-BR";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
