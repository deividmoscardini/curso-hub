import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowLeft, AlertTriangle, Plus, Trash2, Download, Upload, FileSpreadsheet, Sparkles } from "lucide-react";
import * as XLSX from "xlsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { TIPOS_CURSO_ORDENADOS, validarChMinima, type TipoCurso } from "@/lib/regras-tipo-curso";
import { normalizar } from "@/lib/similaridade";
import { SeletorCodigoTurma, CAMPO, livesDaLinha, type LinhaSelecionada } from "@/components/SeletorCodigoTurma";
import { useT } from "@/contexts/i18n";

export const Route = createFileRoute("/_authenticated/solicitacoes/nova")({
  head: () => ({ meta: [{ title: "Nova solicitação" }] }),
  component: NovaSolicitacaoPage,
});

type TipoSolicitacao =
  | "novo_curso"
  | "reordenar_carrossel"
  | "alterar_data_live"
  | "alterar_data_termino"
  | "alterar_data_correcao"
  | "alterar_data_inicio";
type Aba = "disciplinas" | "projeto_aplicacao" | "prova_substitutiva" | "fechamento";

interface CursoRef { id: string; codigo: string; nome: string; }

function NovaSolicitacaoPage() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { t } = useT();
  const [tipo, setTipo] = useState<TipoSolicitacao | null>(null);

  if (!tenantId) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("comum.escolha_produto")}</CardContent></Card>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => tipo ? setTipo(null) : navigate({ to: "/solicitacoes" })}>
          <ArrowLeft className="mr-1 h-4 w-4" />{tipo ? t("solicitacao_nova.escolher_outro") : t("comum.voltar")}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("solicitacao_nova.titulo")}</h1>
        <p className="text-sm text-muted-foreground">
          {!tipo ? t("solicitacao_nova.subtitulo_escolha") : t("solicitacao_nova.subtitulo_preenchimento")}
        </p>
      </div>

      {!tipo && <SelectorTipo onEscolher={setTipo} />}
      {tipo === "novo_curso" && <FormNovoCurso tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
      {tipo === "reordenar_carrossel" && <FormReordenar tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
      {tipo === "alterar_data_live" && <FormAlterarDataLive tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
      {tipo === "alterar_data_termino" && <FormAlterarDataTermino tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
      {tipo === "alterar_data_correcao" && <FormAlterarDataCorrecao tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
      {tipo === "alterar_data_inicio" && <FormAlterarDataInicio tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
    </div>
  );
}

function SelectorTipo({ onEscolher }: { onEscolher: (t: TipoSolicitacao) => void }) {
  const { t } = useT();
  const opcoes: { tipo: TipoSolicitacao; titulo: string; desc: string }[] = [
    { tipo: "novo_curso", titulo: t("solicitacao_nova.tipo_novo_curso"), desc: t("solicitacao_nova.tipo_novo_curso_desc") },
    { tipo: "alterar_data_live", titulo: t("solicitacao_nova.tipo_live"), desc: t("solicitacao_nova.tipo_live_desc") },
    { tipo: "alterar_data_termino", titulo: t("solicitacao_nova.tipo_termino"), desc: t("solicitacao_nova.tipo_termino_desc") },
    { tipo: "alterar_data_correcao", titulo: t("solicitacao_nova.tipo_correcao"), desc: t("solicitacao_nova.tipo_correcao_desc") },
    { tipo: "alterar_data_inicio", titulo: t("solicitacao_nova.tipo_inicio"), desc: t("solicitacao_nova.tipo_inicio_desc") },
    { tipo: "reordenar_carrossel", titulo: t("solicitacao_nova.tipo_reordenar"), desc: t("solicitacao_nova.tipo_reordenar_desc") },
  ];
  return (
    <div className="grid gap-3">
      {opcoes.map((o) => (
        <button
          key={o.tipo}
          onClick={() => onEscolher(o.tipo)}
          className="rounded-md border bg-card p-4 text-left transition hover:bg-accent"
        >
          <div className="font-medium">{o.titulo}</div>
          <div className="mt-1 text-xs text-muted-foreground">{o.desc}</div>
        </button>
      ))}
    </div>
  );
}

async function criarSolicitacao(payload: {
  tenant_id: string;
  tipo: TipoSolicitacao;
  aba?: Aba | null;
  ano?: number | null;
  curso_id?: string | null;
  payload: Record<string, unknown>;
  previa?: unknown;
}): Promise<string> {
  const { data: user } = await supabase.auth.getUser();
  const solicitante_id = user.user?.id;
  const { data, error } = await supabase.from("solicitacoes").insert({
    tenant_id: payload.tenant_id,
    solicitante_id,
    tipo: payload.tipo,
    aba: payload.aba ?? null,
    ano: payload.ano ?? null,
    curso_id: payload.curso_id ?? null,
    payload: payload.payload,
    previa: payload.previa ?? null,
    status: "pendente",
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

// Chama a edge function calcular-previa. Retorna { linhas, aviso? } ou null se erro.
// Recebe `t` do chamador pra localizar toast de erro.
async function calcularPrevia(
  body: Record<string, unknown>,
  t: (chave: string, params?: Record<string, string | number>) => string,
): Promise<{ linhas: unknown[]; aviso?: string } | null> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calcular-previa`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!resp.ok || json.error) {
    toast.error(t("solicitacao_nova.previa_falhou"), { description: json.error ?? "Erro" });
    return null;
  }
  return { linhas: json.linhas, aviso: json.aviso };
}

function useSubmit(
  onDone: (id: string) => void,
  t: (chave: string, params?: Record<string, string | number>) => string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarSolicitacao,
    onSuccess: (id) => {
      toast.success(t("solicitacao_nova.solicitacao_criada"), { description: t("solicitacao_nova.solicitacao_criada_desc") });
      qc.invalidateQueries();
      onDone(id);
    },
    onError: (err: Error) => toast.error(t("solicitacao_nova.falha_criar"), { description: err.message }),
  });
}

// ---------------- Novo Curso ----------------
// Fase 7.3 — Refactor: tipo_curso obrigatorio (S1), sigla auto-sugerida (S3),
// validacao de CH minima antes de enviar (A1), remove prefixo PA que era
// campo tecnico (S9).
const STOPWORDS_SIGLA = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "na", "no", "para", "pra", "com", "sem", "por"]);

function gerarSigla(nome: string): string {
  const palavras = nome
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !STOPWORDS_SIGLA.has(p));
  const iniciais = palavras.map((p) => p[0]).join("").toUpperCase();
  return iniciais.slice(0, 3);
}

// Fase 7.6 — Estrutura de uma disciplina no form (S4+S5)
interface DisciplinaLinha {
  ordem: number;
  nome: string;
  ch: number;
  tipo_oferta: "A" | "C";
  tem_pre_requisito: boolean;
}

function novaLinhaDisciplina(ordem: number, chDefault: number): DisciplinaLinha {
  return { ordem, nome: "", ch: chDefault, tipo_oferta: "A", tem_pre_requisito: false };
}

// Dias da semana (segunda a sábado). "seg" no jsonb pra ficar curto.
// O motor legado usava "quinta"/"quarta" — mapeamos na hora de gerar a
// prévia (só o motor conhece os offsets exatos por dia).
type DiaSemana = "seg" | "ter" | "qua" | "qui" | "sex" | "sab";
const DIAS_SEMANA: Array<{ valor: DiaSemana; label: string }> = [
  { valor: "seg", label: "Segunda-feira" },
  { valor: "ter", label: "Terça-feira" },
  { valor: "qua", label: "Quarta-feira" },
  { valor: "qui", label: "Quinta-feira" },
  { valor: "sex", label: "Sexta-feira" },
  { valor: "sab", label: "Sábado" },
];

function FormNovoCurso({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const { t } = useT();
  const [tipoCurso, setTipoCurso] = useState<TipoCurso>("pos_graduacao");
  const [codigo, setCodigo] = useState("");
  const [aguardandoCodigo, setAguardandoCodigo] = useState(false);
  const [sigla, setSigla] = useState("");
  const [siglaEditadaManualmente, setSiglaEditadaManualmente] = useState(false);
  const [nome, setNome] = useState("");
  const [escola, setEscola] = useState("");
  const [chDefault, setChDefault] = useState("20");
  const [diaSemana, setDiaSemana] = useState<DiaSemana>("qui");
  const [semanaLive, setSemanaLive] = useState("3");
  const [duracaoSemanas, setDuracaoSemanas] = useState("4");
  const [anoEstreia, setAnoEstreia] = useState("");
  const [dataInicioE1, setDataInicioE1] = useState("");
  const [captacaoInicio, setCaptacaoInicio] = useState("");
  const [paCh, setPaCh] = useState("60");
  const [gerandoPrevia, setGerandoPrevia] = useState(false);
  // S4+S5 — linhas dinamicas de disciplinas com pre-requisito
  const [disciplinas, setDisciplinas] = useState<DisciplinaLinha[]>(() => [novaLinhaDisciplina(1, 20)]);
  const mut = useSubmit(onDone, t);

  // A2 — busca cursos existentes no tenant pra bloquear duplicata de nome
  const { data: cursosExistentes } = useQuery({
    queryKey: ["cursos-tenant", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("cursos").select("id, codigo, nome").eq("tenant_id", tenantId);
      return (data ?? []) as Array<{ id: string; codigo: string; nome: string }>;
    },
  });

  const nomeNormalizado = normalizar(nome);
  const cursoDuplicado = nomeNormalizado && (cursosExistentes ?? []).find((c) => normalizar(c.nome) === nomeNormalizado);

  // Auto-sugestao de sigla (S3)
  const siglaSugerida = gerarSigla(nome);
  if (!siglaEditadaManualmente && siglaSugerida !== sigla) {
    setTimeout(() => { if (!siglaEditadaManualmente) setSigla(siglaSugerida); }, 0);
  }

  // Handlers das linhas de disciplina
  const chNumDefault = parseInt(chDefault, 10) || 20;
  function adicionarLinha() {
    setDisciplinas((ds) => [...ds, novaLinhaDisciplina(ds.length + 1, chNumDefault)]);
  }
  function removerLinha(idx: number) {
    setDisciplinas((ds) => ds.filter((_, i) => i !== idx).map((d, i) => ({ ...d, ordem: i + 1 })));
  }
  function atualizarLinha(idx: number, patch: Partial<DisciplinaLinha>) {
    setDisciplinas((ds) => ds.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }
  function setQuantidade(n: number) {
    setDisciplinas((ds) => {
      if (n <= 0) return [];
      if (n === ds.length) return ds;
      if (n > ds.length) {
        const extras = Array.from({ length: n - ds.length }, (_, k) => novaLinhaDisciplina(ds.length + k + 1, chNumDefault));
        return [...ds, ...extras];
      }
      return ds.slice(0, n).map((d, i) => ({ ...d, ordem: i + 1 }));
    });
  }

  const disciplinasValidas = disciplinas.filter((d) => d.nome.trim().length > 0);
  const chTotal = disciplinasValidas.reduce((s, d) => s + (d.ch ?? 0), 0);
  const validacaoCh = validarChMinima(tipoCurso, chTotal);

  const gerarOfertas = !!(anoEstreia && dataInicioE1 && captacaoInicio);
  const codigoOk = codigo.trim() || aguardandoCodigo;
  const podeEnviar = codigoOk && sigla.trim() && nome.trim() && !cursoDuplicado && disciplinasValidas.length > 0 && validacaoCh.ok;

  async function submeter() {
    if (!podeEnviar) return;

    let previa: unknown = null;
    if (gerarOfertas) {
      setGerandoPrevia(true);
      // Motor legado só entende "quinta" e "quarta"; pros outros dias
      // usamos quinta como fallback + aviso no toast. Refatoração do
      // motor pra suportar seg-sab entra em backlog.
      const diaMotor: "quinta" | "quarta" =
        diaSemana === "qua" ? "quarta" : "quinta";
      if (diaSemana !== "qua" && diaSemana !== "qui") {
        const nomeDia = DIAS_SEMANA.find((d) => d.valor === diaSemana)?.label ?? "";
        toast.info(t("solicitacao_nova.aviso_motor_titulo"), {
          description: t("solicitacao_nova.aviso_motor_desc", { dia: nomeDia }),
        });
      }
      const semanaLiveNum = Math.max(1, parseInt(semanaLive, 10) || 3);
      const semanaFechamentoNum = semanaLiveNum + 1;
      const offsetPorSemana = (n: number) => (diaMotor === "quinta" ? 7 * (n - 1) + 3 : 7 * (n - 1) + 2);
      const cursoMaster = {
        sigla: sigla.trim().toUpperCase(),
        curso: nome.trim(),
        diaSemanaDefault: diaMotor,
        paCh: parseInt(paCh, 10) || 60,
        paAnosElegiveis: [],
        paCodigoPrefixo: "",
        carrossel: disciplinasValidas.map((d) => ({
          ordem: d.ordem,
          disciplina: d.nome,
          codigoDisciplina: null,
          tipoOferta: d.tipo_oferta,
          ch: d.ch,
          liveEstudoCasoOffset: offsetPorSemana(semanaLiveNum),
          liveFechamentoOffset: offsetPorSemana(semanaFechamentoNum),
        })),
      };
      const r = await calcularPrevia({
        aba: "disciplinas",
        ano: parseInt(anoEstreia, 10),
        ancora: dataInicioE1,
        cod_curso: codigo.trim() || "PENDENTE",
        ordem_inicial: 1,
        captacao_inicio: captacaoInicio,
        curso_master: cursoMaster,
      });
      setGerandoPrevia(false);
      if (!r) return; // erro já mostrou toast
      previa = { linhas: r.linhas, aviso: r.aviso };
    }

    mut.mutate({
      tenant_id: tenantId, tipo: "novo_curso",
      aba: gerarOfertas ? "disciplinas" : null,
      ano: gerarOfertas ? parseInt(anoEstreia, 10) : null,
      payload: {
        tipo_curso: tipoCurso,
        codigo: codigo.trim() || null,
        aguardando_codigo: aguardandoCodigo,
        sigla: sigla.trim().toUpperCase(),
        escola: escola.trim() || null, nome: nome.trim(),
        disciplinas: disciplinasValidas,
        ...(gerarOfertas && {
          gerar_ofertas_ano_estreia: true,
          dia_semana_default: diaSemana,
          semana_live: parseInt(semanaLive, 10) || 3,
          duracao_disciplina_semanas: parseInt(duracaoSemanas, 10) || 4,
          pa_ch: parseInt(paCh, 10) || 60,
        }),
      },
      previa,
    });
  }

  // Fase 8.9 — Template XLSX real com instruções, exemplos e validação
  // por coluna. Muito mais didático que o CSV antigo. Estrutura: 2 abas
  // (Disciplinas com dados + Instruções com o "como preencher").
  function baixarTemplate() {
    // Aba principal: cabeçalho amigável + 3 exemplos + linhas em branco.
    const dadosAba = [
      ["Ordem", "Nome da disciplina", "Carga horária (h)", "Tipo de oferta", "Tem pré-requisito?"],
      [1, "Fundamentos de Marketing Digital", 20, "Exclusiva", "Não"],
      [2, "Estratégias de Mercado", 24, "Exclusiva", "Não"],
      [3, "Ética Digital", 20, "Compartilhada", "Sim"],
      [4, "", "", "", ""],
      [5, "", "", "", ""],
      [6, "", "", "", ""],
      [7, "", "", "", ""],
      [8, "", "", "", ""],
    ];
    const wsDados = XLSX.utils.aoa_to_sheet(dadosAba);
    wsDados["!cols"] = [
      { wch: 8 }, { wch: 42 }, { wch: 18 }, { wch: 22 }, { wch: 20 },
    ];

    const instrucoes = [
      ["Como preencher este template"],
      [""],
      ["1. Ordem — número sequencial da disciplina no carrossel (1, 2, 3…)."],
      ["2. Nome da disciplina — nome completo, sem abreviações."],
      ["3. Carga horária (h) — em horas. Exemplos: 20, 24, 40."],
      ["4. Tipo de oferta:"],
      ["   • Exclusiva — só este curso tem essa disciplina."],
      ["   • Compartilhada — outros cursos também têm (mesma data no calendário)."],
      ["5. Tem pré-requisito? — responda \"Sim\" ou \"Não\". \"Sim\" trava a ordem/dependência com a disciplina anterior."],
      [""],
      ["Depois de preencher, salve o arquivo e clique em \"Importar\" no formulário. As linhas em branco são ignoradas."],
      [""],
      ["Dúvidas? Fale com o time do calendário."],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInstr["!cols"] = [{ wch: 90 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDados, "Disciplinas");
    XLSX.utils.book_append_sheet(wb, wsInstr, "Instruções");
    XLSX.writeFile(wb, "template-novo-curso.xlsx");
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      // Aceita xlsx (com aba "Disciplinas") OU csv legado (primeira aba).
      const nomeAba = wb.SheetNames.includes("Disciplinas") ? "Disciplinas" : wb.SheetNames[0];
      const sheet = wb.Sheets[nomeAba];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed: DisciplinaLinha[] = rows.map((r, i) => {
        const nome = String(r["Nome da disciplina"] ?? r["Nome"] ?? "").trim();
        const chRaw = r["Carga horária (h)"] ?? r["CH"] ?? r["Carga horária"] ?? 20;
        const tipoRaw = String(r["Tipo de oferta"] ?? r["Tipo"] ?? "Exclusiva").trim().toLowerCase();
        const preRaw = String(r["Tem pré-requisito?"] ?? r["Pré-requisito"] ?? r["Tem pre-requisito"] ?? "não").trim().toLowerCase();
        return {
          ordem: i + 1,
          nome,
          ch: typeof chRaw === "number" ? chRaw : parseInt(String(chRaw), 10) || 20,
          tipo_oferta: (tipoRaw.startsWith("c") ? "C" : "A") as "A" | "C",
          tem_pre_requisito: /^(sim|s|true|1|yes|y)/i.test(preRaw),
        };
      }).filter((d) => d.nome.length > 0);
      if (parsed.length === 0) {
        toast.error(t("solicitacao_nova.arquivo_invalido"), { description: t("solicitacao_nova.baixe_template") });
        return;
      }
      setDisciplinas(parsed);
      toast.success(t("solicitacao_nova.disciplinas_importadas", { n: parsed.length }));
    } catch (err) {
      toast.error(t("solicitacao_nova.falha_ler_arquivo"), { description: String(err instanceof Error ? err.message : err) });
    } finally {
      e.target.value = "";
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("solicitacao_nova.novo_curso_titulo")}</CardTitle>
        <CardDescription>{t("solicitacao_nova.novo_curso_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* S1 — Tipo de curso primeiro */}
        <Campo label={t("solicitacao_nova.tipo_curso")}>
          <RadioGroup value={tipoCurso} onValueChange={(v) => setTipoCurso(v as TipoCurso)} className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {TIPOS_CURSO_ORDENADOS.map((tc) => (
              <label key={tc.valor} className={`flex cursor-pointer flex-col gap-1 rounded-md border p-2 text-sm hover:bg-accent ${tipoCurso === tc.valor ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={tc.valor} />
                  <span className="font-medium">{tc.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{tc.desc}</span>
              </label>
            ))}
          </RadioGroup>
        </Campo>

        <Campo label={t("solicitacao_nova.nome_curso")}>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("solicitacao_nova.nome_curso_placeholder")} />
          {cursoDuplicado && (
            <div className="mt-1 flex gap-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("solicitacao_nova.curso_duplicado", { codigo: cursoDuplicado.codigo })}</span>
            </div>
          )}
        </Campo>

        <div className="grid gap-3 md:grid-cols-2">
          <Campo label={aguardandoCodigo ? t("solicitacao_nova.codigo_aguardando") : t("solicitacao_nova.codigo")}>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder={t("solicitacao_nova.codigo_placeholder")} disabled={aguardandoCodigo} />
            <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={aguardandoCodigo} onChange={(e) => setAguardandoCodigo(e.target.checked)} />
              {t("solicitacao_nova.aguardando_codigo")}
            </label>
          </Campo>
          <Campo label={siglaEditadaManualmente ? t("solicitacao_nova.sigla_editada") : t("solicitacao_nova.sigla_sugerida")}>
            <Input value={sigla} onChange={(e) => { setSigla(e.target.value.toUpperCase()); setSiglaEditadaManualmente(true); }} placeholder="SIG" maxLength={3} />
          </Campo>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label={t("solicitacao_nova.escola")}><Input value={escola} onChange={(e) => setEscola(e.target.value)} placeholder={t("solicitacao_nova.escola_placeholder")} /></Campo>
          <Campo label={t("solicitacao_nova.ch_padrao")}>
            <Select value={chDefault} onValueChange={setChDefault}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20h</SelectItem>
                <SelectItem value="24">24h</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
        </div>
        {/* Fase 8.9 — Bloco de template + importação em DESTAQUE, antes do
            preenchimento manual. Estrutura "OU / OU": ou importa planilha,
            ou preenche manualmente na tabela abaixo. */}
        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="rounded-full bg-primary/15 p-2 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">{t("solicitacao_nova.template_titulo")}</div>
              <div className="text-xs text-muted-foreground">{t("solicitacao_nova.template_ou")}</div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={baixarTemplate}
              className="group flex items-start gap-3 rounded-md border bg-background p-3 text-left transition hover:border-primary/60 hover:bg-primary/5"
            >
              <div className="rounded-md bg-emerald-500/10 p-2 text-emerald-600 group-hover:bg-emerald-500/20">
                <Download className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{t("solicitacao_nova.template_baixar")}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t("solicitacao_nova.template_baixar_desc")}</div>
              </div>
            </button>
            <label className="group flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3 text-left transition hover:border-primary/60 hover:bg-primary/5">
              <div className="rounded-md bg-sky-500/10 p-2 text-sky-600 group-hover:bg-sky-500/20">
                <Upload className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{t("solicitacao_nova.template_enviar")}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t("solicitacao_nova.template_enviar_desc")}</div>
              </div>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={upload} />
            </label>
          </div>
        </div>

        {/* S4+S5 — disciplinas dinamicas com pre-requisito (preenchimento manual) */}
        <div className="rounded-md border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">{t("solicitacao_nova.disciplinas_carrossel")}</label>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{t("solicitacao_nova.quantas")}</span>
                <Input type="number" min={0} value={disciplinas.length} onChange={(e) => setQuantidade(parseInt(e.target.value, 10) || 0)} className="h-7 w-16" />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              <button type="button" onClick={baixarTemplate} className="underline">{t("solicitacao_nova.template_link_alt")}</button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {disciplinas.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">{t("solicitacao_nova.sem_disciplinas")}</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 p-1 text-left">#</th>
                    <th className="p-1 text-left">{t("solicitacao_nova.nome_disciplina")}</th>
                    <th className="w-20 p-1">{t("solicitacao_nova.ch")}</th>
                    <th className="w-16 p-1">{t("solicitacao_nova.tipo")}</th>
                    <th className="w-24 p-1 text-center">{t("solicitacao_nova.pre_requisito")}</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {disciplinas.map((d, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1 text-xs text-muted-foreground">{d.ordem}</td>
                      <td className="p-1"><Input value={d.nome} onChange={(e) => atualizarLinha(i, { nome: e.target.value })} placeholder={t("solicitacao_nova.nome_disciplina")} className="h-8" /></td>
                      <td className="p-1"><Input type="number" min={0} max={200} value={d.ch} onChange={(e) => atualizarLinha(i, { ch: parseInt(e.target.value, 10) || 0 })} className="h-8" /></td>
                      <td className="p-1">
                        <Select value={d.tipo_oferta} onValueChange={(v) => atualizarLinha(i, { tipo_oferta: v as "A" | "C" })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">{t("solicitacao_nova.tipo_a")}</SelectItem>
                            <SelectItem value="C">{t("solicitacao_nova.tipo_c")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-1 text-center">
                        <input type="checkbox" checked={d.tem_pre_requisito} onChange={(e) => atualizarLinha(i, { tem_pre_requisito: e.target.checked })} />
                      </td>
                      <td className="p-1">
                        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removerLinha(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2">
            <Button type="button" size="sm" variant="outline" onClick={adicionarLinha}>
              <Plus className="mr-1 h-3 w-3" />{t("solicitacao_nova.disciplina")}
            </Button>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">{t("solicitacao_nova.disciplinas_com_nome", { n: disciplinasValidas.length })}</span>
              <span className={`font-medium ${validacaoCh.ok ? "text-emerald-600" : "text-rose-600"}`}>
                {t("solicitacao_nova.total", { n: chTotal })} {validacaoCh.ch_minima > 0 && `/ ${t("solicitacao_nova.minimo", { n: validacaoCh.ch_minima })}`}
              </span>
            </div>
          </div>
        </div>
        {!validacaoCh.ok && (
          <div className="flex gap-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{validacaoCh.mensagem}</span>
          </div>
        )}

        <div className="mt-4 rounded-md border p-3">
          <div className="mb-2 font-medium text-sm">{t("solicitacao_nova.bloco_ofertas")}</div>
          <p className="mb-3 text-xs text-muted-foreground">{t("solicitacao_nova.bloco_ofertas_desc")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo label={t("solicitacao_nova.ano_lancamento")}>
              <Input type="number" value={anoEstreia} onChange={(e) => setAnoEstreia(e.target.value)} placeholder="2027" />
            </Campo>
            <Campo label={t("solicitacao_nova.dia_semana_live")}>
              <Select value={diaSemana} onValueChange={(v) => setDiaSemana(v as DiaSemana)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIAS_SEMANA.map((d) => (
                    <SelectItem key={d.valor} value={d.valor}>{t(`solicitacao_nova.dia_${d.valor}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Campo label={t("solicitacao_nova.semana_live")}>
              <Input type="number" min={1} max={12} value={semanaLive} onChange={(e) => setSemanaLive(e.target.value)} placeholder="3" />
              <div className="mt-1 text-[10px] text-muted-foreground">{t("solicitacao_nova.semana_live_desc")}</div>
            </Campo>
            <Campo label={t("solicitacao_nova.duracao_semanas")}>
              <Input type="number" min={1} max={20} value={duracaoSemanas} onChange={(e) => setDuracaoSemanas(e.target.value)} placeholder="4" />
              <div className="mt-1 text-[10px] text-muted-foreground">{t("solicitacao_nova.duracao_semanas_desc")}</div>
            </Campo>
            <Campo label={t("solicitacao_nova.data_inicio_aulas")}>
              <Input type="date" value={dataInicioE1} onChange={(e) => setDataInicioE1(e.target.value)} />
            </Campo>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Campo label={t("solicitacao_nova.captacao_e2")}>
              <Input type="date" value={captacaoInicio} onChange={(e) => setCaptacaoInicio(e.target.value)} />
              <div className="mt-1 text-[10px] text-muted-foreground">{t("solicitacao_nova.captacao_e2_desc")}</div>
            </Campo>
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending || gerandoPrevia} onClick={submeter}>
            {(gerandoPrevia || mut.isPending) ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{gerandoPrevia ? t("comum.calculando_previa") : t("comum.enviando")}</> : t("solicitacao_nova.enviar_solicitacao")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Fase 8 — Alteração de data (4 subtipos) ----------------
// Todos compartilham SeletorCodigoTurma pra escolher a linha, mostram data
// atual pré-preenchida e exigem motivo textual (regra da Bruna: motivo
// obrigatório em toda alteração de data).

function FormAlterarDataLive({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const { t } = useT();
  const [linha, setLinha] = useState<LinhaSelecionada | null>(null);
  const [campo, setCampo] = useState<string>("");
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const mut = useSubmit(onDone, t);

  const lives = linha ? livesDaLinha(linha.dados) : [];
  const inicio = linha ? CAMPO.inicio(linha.dados) : null;
  const fim = linha ? CAMPO.fim(linha.dados) : null;
  const foraDeJanela = !!(inicio && fim && novaData && (novaData < inicio || novaData > fim));
  const podeEnviar = linha && campo && novaData && motivo.trim() && !foraDeJanela;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("solicitacao_nova.tipo_live")}</CardTitle>
        <CardDescription>{t("solicitacao_nova.tipo_live_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label={t("solicitacao_nova.turma")}>
          <SeletorCodigoTurma tenantId={tenantId} selecionada={linha} onSelecionar={(l) => { setLinha(l); setCampo(""); }} />
        </Campo>
        {linha && lives.length === 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            {t("solicitacao_nova.sem_lives")}
          </div>
        )}
        {linha && lives.length > 0 && (
          <Campo label={t("solicitacao_nova.qual_live")}>
            <Select value={campo} onValueChange={setCampo}>
              <SelectTrigger><SelectValue placeholder={t("solicitacao_nova.escolha_live")} /></SelectTrigger>
              <SelectContent>
                {lives.map((l) => (
                  <SelectItem key={l.campo} value={l.campo}>
                    {l.label} {l.valor ? `— ${t("solicitacao_nova.live_hoje", { data: l.valor })}` : t("solicitacao_nova.live_sem_data")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        )}
        <Campo label={t("solicitacao_nova.nova_data")}>
          <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
        </Campo>
        {inicio && fim && (
          <div className="text-xs text-muted-foreground">{t("solicitacao_nova.periodo_disciplina", { inicio, fim })}</div>
        )}
        {foraDeJanela && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{t("solicitacao_nova.data_fora_janela")}</div>
          </div>
        )}
        <Campo label={t("comum.motivo_obrigatorio")}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder={t("solicitacao_nova.motivo_placeholder")} />
        </Campo>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "alterar_data_live",
            aba: "disciplinas", ano: linha!.ano,
            payload: { chave_natural: linha!.chave_natural, campo, nova_data: novaData, motivo: motivo.trim() },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("comum.enviando")}</> : t("solicitacao_nova.enviar_solicitacao")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FormAlterarDataTermino({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const { t } = useT();
  const [linha, setLinha] = useState<LinhaSelecionada | null>(null);
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const mut = useSubmit(onDone, t);

  const terminoAtual = linha ? CAMPO.fim(linha.dados) : null;
  const podeEnviar = linha && novaData && motivo.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("solicitacao_nova.tipo_termino")}</CardTitle>
        <CardDescription>{t("solicitacao_nova.tipo_termino_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label={t("solicitacao_nova.turma")}>
          <SeletorCodigoTurma tenantId={tenantId} selecionada={linha} onSelecionar={setLinha} />
        </Campo>
        {linha && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{t("solicitacao_nova.aviso_atividade")}</div>
            </div>
          </div>
        )}
        <Campo label={t("solicitacao_nova.novo_termino")}>
          <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
        </Campo>
        {terminoAtual && <div className="text-xs text-muted-foreground">{t("solicitacao_nova.termino_atual", { data: terminoAtual })}</div>}
        <Campo label={t("comum.motivo_obrigatorio")}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        </Campo>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "alterar_data_termino",
            aba: "disciplinas", ano: linha!.ano,
            payload: { chave_natural: linha!.chave_natural, campo: CAMPO.termino, nova_data: novaData, motivo: motivo.trim() },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("comum.enviando")}</> : t("solicitacao_nova.enviar_solicitacao")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FormAlterarDataCorrecao({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const { t } = useT();
  const [linha, setLinha] = useState<LinhaSelecionada | null>(null);
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const mut = useSubmit(onDone, t);

  const correcaoAtual = linha ? String((linha.dados as Record<string, unknown>)[CAMPO.correcao] ?? "") : "";
  const podeEnviar = linha && novaData && motivo.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("solicitacao_nova.tipo_correcao")}</CardTitle>
        <CardDescription>{t("solicitacao_nova.tipo_correcao_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label={t("solicitacao_nova.turma")}>
          <SeletorCodigoTurma tenantId={tenantId} selecionada={linha} onSelecionar={setLinha} />
        </Campo>
        <Campo label={t("solicitacao_nova.nova_correcao")}>
          <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
        </Campo>
        {correcaoAtual && <div className="text-xs text-muted-foreground">{t("solicitacao_nova.correcao_atual", { data: correcaoAtual })}</div>}
        <Campo label={t("comum.motivo_obrigatorio")}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        </Campo>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "alterar_data_correcao",
            aba: "disciplinas", ano: linha!.ano,
            payload: { chave_natural: linha!.chave_natural, campo: CAMPO.correcao, nova_data: novaData, motivo: motivo.trim() },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("comum.enviando")}</> : t("solicitacao_nova.enviar_solicitacao")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FormAlterarDataInicio({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const { t } = useT();
  const [linha, setLinha] = useState<LinhaSelecionada | null>(null);
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [propagar, setPropagar] = useState(false);
  const mut = useSubmit(onDone, t);

  const inicioAtual = linha ? CAMPO.inicio(linha.dados) : null;
  const podeEnviar = linha && novaData && motivo.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("solicitacao_nova.tipo_inicio")}</CardTitle>
        <CardDescription>{t("solicitacao_nova.tipo_inicio_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{t("solicitacao_nova.aviso_inicio")}</div>
          </div>
        </div>
        <Campo label={t("solicitacao_nova.turma")}>
          <SeletorCodigoTurma tenantId={tenantId} selecionada={linha} onSelecionar={setLinha} />
        </Campo>
        <Campo label={t("solicitacao_nova.novo_inicio")}>
          <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
        </Campo>
        {inicioAtual && <div className="text-xs text-muted-foreground">{t("solicitacao_nova.inicio_atual", { data: inicioAtual })}</div>}
        <div className="flex items-start gap-2 rounded-md border p-3">
          <Checkbox id="propagar" checked={propagar} onCheckedChange={(v) => setPropagar(!!v)} />
          <label htmlFor="propagar" className="text-sm">
            <span className="font-medium">{t("solicitacao_nova.propagar")}</span>
            <div className="text-xs text-muted-foreground">{t("solicitacao_nova.propagar_desc")}</div>
          </label>
        </div>
        <Campo label={t("comum.motivo_obrigatorio")}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        </Campo>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "alterar_data_inicio",
            aba: "disciplinas", ano: linha!.ano,
            payload: {
              chave_natural: linha!.chave_natural,
              campo: "DATA  INÍCIO",
              nova_data: novaData,
              motivo: motivo.trim(),
              propagar_seguintes: propagar,
            },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("comum.enviando")}</> : t("solicitacao_nova.enviar_solicitacao")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Reordenar Carrossel ----------------
function FormReordenar({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const { t } = useT();
  const [cursoId, setCursoId] = useState<string>("");
  const [ordemFinalTxt, setOrdemFinalTxt] = useState("");
  const mut = useSubmit(onDone, t);

  const { data: cursos } = useQuery({
    queryKey: ["cursos-do-tenant", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("cursos").select("id, codigo, nome").eq("tenant_id", tenantId).order("codigo");
      return (data ?? []) as CursoRef[];
    },
  });

  const { data: disciplinasAtuais } = useQuery({
    queryKey: ["disciplinas-do-curso", cursoId],
    queryFn: async () => {
      if (!cursoId) return [];
      const { data } = await supabase.from("disciplinas").select("nome, ordem_carrossel, ch, tipo_oferta").eq("curso_id", cursoId).order("ordem_carrossel");
      return data ?? [];
    },
    enabled: !!cursoId,
  });

  const ordemFinal = ordemFinalTxt.split("\n").map((s) => s.trim()).filter(Boolean).map((nome, i) => ({ ordem: i + 1, nome, ch: 20, tipo_oferta: "A" as const }));
  const podeEnviar = cursoId && ordemFinal.length > 0;

  return (
    <Card>
      <CardHeader><CardTitle>{t("solicitacao_nova.tipo_reordenar")}</CardTitle>
        <CardDescription>{t("solicitacao_nova.reordenar_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label={t("solicitacao_nova.curso")}>
          <Select value={cursoId} onValueChange={(v) => setCursoId(v)}>
            <SelectTrigger><SelectValue placeholder={t("solicitacao_nova.escolher_curso")} /></SelectTrigger>
            <SelectContent>
              {cursos?.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
        {disciplinasAtuais && disciplinasAtuais.length > 0 && (
          <div className="rounded-md border bg-muted/20 p-3 text-xs">
            <div className="mb-1 font-medium">{t("solicitacao_nova.ordem_atual", { n: disciplinasAtuais.length })}</div>
            <ol className="ml-4 list-decimal space-y-0.5">
              {disciplinasAtuais.map((d, i) => <li key={i}>{d.nome}</li>)}
            </ol>
            <Button variant="link" size="sm" className="mt-2 h-auto p-0" onClick={() => setOrdemFinalTxt(disciplinasAtuais.map((d) => d.nome).join("\n"))}>
              {t("solicitacao_nova.copiar_edicao")}
            </Button>
          </div>
        )}
        <Campo label={t("solicitacao_nova.nova_ordem")}>
          <Textarea value={ordemFinalTxt} onChange={(e) => setOrdemFinalTxt(e.target.value)} rows={16} placeholder={t("solicitacao_nova.nova_ordem_placeholder")} />
        </Campo>
        <div className="text-xs text-muted-foreground">{t("solicitacao_nova.nova_ordem_qtd", { n: ordemFinal.length })}</div>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "reordenar_carrossel", curso_id: cursoId,
            payload: { curso_id: cursoId, ordem_final: ordemFinal },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("comum.enviando")}</> : t("solicitacao_nova.enviar_solicitacao")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Cancelar oferta saiu do radio de solicitações (Fase 8, decisão da
// reunião de 6/ago/2026) — cenário excepcional que o admin resolve
// direto em /admin/calendario.

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
