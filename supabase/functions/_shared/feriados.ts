/**
 * Feriados e dias úteis para o calendário acadêmico 411 PUC RIO COLLAB.
 *
 * Porta fiel de `sistema_calendario/feriados.py` (Python) para TypeScript,
 * para rodar nativamente como Supabase Edge Function (Deno). Mesma lista de
 * feriados da Documentação - 411 PUC RIO COLLAB.docx, seção 7.1.
 *
 * workday() replica o WORKDAY() do Excel tal como usado no arquivo original:
 * conta só dias úteis (segunda a sexta), SEM excluir feriados — de
 * propósito, é assim que as fórmulas do arquivo original funcionam.
 *
 * Datas são representadas como string "AAAA-MM-DD" (ISO, sem hora/fuso) em
 * toda a API pública, para evitar armadilhas de fuso horário do objeto
 * Date do JS. Internamente usamos um pequeno helper baseado em UTC.
 */

export type ISODate = string; // "AAAA-MM-DD"

function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** 0=domingo ... 6=sábado (igual a Date.getUTCDay()) */
export function weekday(date: ISODate): number {
  return toUTC(date).getUTCDay();
}

function isWeekend(date: ISODate): boolean {
  const wd = weekday(date);
  return wd === 0 || wd === 6;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Feriados considerados para um ano civil (docx seção 7.1). */
export function holidaysForYear(year: number): Map<ISODate, string> {
  const e = easter(year);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fixed = `${year}`;
  const m = new Map<ISODate, string>();
  m.set(`${fixed}-01-01`, "Confraternização Universal");
  m.set(`${fixed}-04-21`, "Tiradentes");
  m.set(`${fixed}-05-01`, "Dia do Trabalho");
  m.set(`${fixed}-09-07`, "Independência do Brasil");
  m.set(`${fixed}-10-12`, "Nossa Senhora Aparecida");
  m.set(`${fixed}-11-02`, "Finados");
  m.set(`${fixed}-11-15`, "Proclamação da República");
  m.set(`${fixed}-11-20`, "Dia da Consciência Negra");
  m.set(`${fixed}-12-25`, "Natal");
  m.set(addDays(e, -48), "Carnaval (segunda-feira)");
  m.set(addDays(e, -47), "Carnaval (terça-feira)");
  m.set(addDays(e, -2), "Sexta-Feira Santa");
  m.set(addDays(e, 60), "Corpus Christi");
  m.set(`${fixed}-01-20`, "São Sebastião (RJ)");
  m.set(`${fixed}-04-23`, "São Jorge (RJ)");
  m.set(`${fixed}-06-13`, "Santo Antônio (RJ)");
  return m;
}

export class HolidayCalendar {
  private cache = new Map<ISODate, string>();
  private yearsLoaded = new Set<number>();

  private ensureYear(year: number) {
    if (!this.yearsLoaded.has(year)) {
      for (const [date, nome] of holidaysForYear(year)) this.cache.set(date, nome);
      this.yearsLoaded.add(year);
    }
  }

  nameIfHoliday(date: ISODate): string | null {
    this.ensureYear(Number(date.slice(0, 4)));
    return this.cache.get(date) ?? null;
  }

  isHoliday(date: ISODate): boolean {
    return this.nameIfHoliday(date) !== null;
  }
}

/**
 * Equivalente ao WORKDAY() do Excel: avança (ou recua, se days<0) `days`
 * dias úteis (segunda a sexta) a partir de `start`. NÃO exclui feriados.
 */
export function workday(start: ISODate, days: number): ISODate {
  let d = start;
  const step = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d = addDays(d, step);
    if (!isWeekend(d)) remaining -= 1;
  }
  return d;
}
