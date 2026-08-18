// Fase 12.5 — Resumo de uma linha da solicitação, pra aparecer na
// lista antes do usuário abrir o detalhe. A Bruna reclamou que a
// coluna "Tipo · Ano" não dava contexto suficiente pra decidir o que
// abrir. Aqui a gente extrai um sumário útil do `payload`.

import { formatarData, type Idioma } from "./formatar-data";
import { labelColuna } from "./colunas-calendario";

interface SolicitacaoParaResumo {
  tipo: string;
  payload?: unknown;
}

/**
 * Devolve uma frase curta (até ~80 chars) descrevendo o pedido em
 * português/espanhol. Nunca lança — se o payload for lixo ou
 * inesperado, devolve "—".
 */
export function resumirSolicitacao(
  sol: SolicitacaoParaResumo,
  idioma: Idioma = "pt",
): string {
  const p = (sol.payload ?? {}) as Record<string, unknown>;

  switch (sol.tipo) {
    case "alterar_data_live":
    case "alterar_data_termino":
    case "alterar_data_correcao":
    case "alterar_data_inicio": {
      const turma = str(p.codigo_turma) || str(p.chave_natural);
      const novaData = formatarData(p.nova_data, idioma);
      const campo = str(p.campo) ? labelColuna(str(p.campo)!) : null;
      if (turma && campo) return `${turma} · ${campo} → ${novaData}`;
      if (turma) return `${turma} → ${novaData}`;
      return novaData;
    }

    case "novo_curso": {
      const sigla = str(p.sigla) || str((p.curso_master as Record<string, unknown>)?.sigla);
      const nome = str(p.nome) || str((p.curso_master as Record<string, unknown>)?.curso);
      const disciplinas = Array.isArray(p.disciplinas) ? p.disciplinas.length : 0;
      const partes: string[] = [];
      if (sigla) partes.push(sigla);
      if (nome) partes.push(nome);
      if (disciplinas > 0) {
        partes.push(
          idioma === "es"
            ? `${disciplinas} disciplinas`
            : `${disciplinas} disciplinas`,
        );
      }
      return partes.join(" · ") || "—";
    }

    case "reordenar_carrossel": {
      const cursoNome = str(p.curso_nome) || str(p.codigo_curso);
      const n = Array.isArray(p.nova_ordem) ? p.nova_ordem.length : 0;
      if (cursoNome && n > 0) {
        return idioma === "es"
          ? `${cursoNome} · ${n} disciplinas`
          : `${cursoNome} · ${n} disciplinas`;
      }
      return cursoNome || "—";
    }

    case "cancelar_oferta": {
      const turma = str(p.codigo_turma) || str(p.chave_natural);
      const motivoCurto = trunc(str(p.motivo) ?? "", 40);
      return [turma, motivoCurto].filter(Boolean).join(" · ") || "—";
    }

    case "gerar_ano": {
      const ano = str(p.ano) ?? "";
      return idioma === "es" ? `Año ${ano}` : `Ano ${ano}`;
    }

    case "nova_oferta": {
      const turma = str(p.codigo_turma) || str(p.chave_natural);
      return turma || "—";
    }

    default:
      return "—";
  }
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
