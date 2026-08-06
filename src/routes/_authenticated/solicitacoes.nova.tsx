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
import { Loader2, ArrowLeft, AlertTriangle, Plus, Trash2, Download, Upload, FileSpreadsheet } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { TIPOS_CURSO_ORDENADOS, validarChMinima, type TipoCurso } from "@/lib/regras-tipo-curso";
import { normalizar } from "@/lib/similaridade";
import { SeletorCodigoTurma, CAMPO, livesDaLinha, type LinhaSelecionada } from "@/components/SeletorCodigoTurma";

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
  const [tipo, setTipo] = useState<TipoSolicitacao | null>(null);

  if (!tenantId) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Selecione um produto no menu lateral.</CardContent></Card>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => tipo ? setTipo(null) : navigate({ to: "/solicitacoes" })}>
          <ArrowLeft className="mr-1 h-4 w-4" />{tipo ? "Escolher outro tipo" : "Voltar"}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nova solicitação</h1>
        <p className="text-sm text-muted-foreground">
          {!tipo ? "Escolha o tipo de mudança que você quer pedir." : "Preencha os dados do pedido. Um aprovador vai revisar antes de aplicar."}
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
  const opcoes: { tipo: TipoSolicitacao; titulo: string; desc: string }[] = [
    { tipo: "novo_curso", titulo: "Abertura de novo curso", desc: "Cadastra um curso novo com suas disciplinas. As ofertas do primeiro ano são geradas junto." },
    { tipo: "alterar_data_live", titulo: "Alterar data de live", desc: "Troca a data de uma live específica em uma turma existente. Nova data precisa cair dentro do período da disciplina." },
    { tipo: "alterar_data_termino", titulo: "Alterar data de término da disciplina", desc: "Prorroga o término da disciplina. A data de entrega da atividade avaliativa é atualizada junto." },
    { tipo: "alterar_data_correcao", titulo: "Alterar data de correção do professor", desc: "Muda a data limite pra correção da atividade avaliativa." },
    { tipo: "alterar_data_inicio", titulo: "Alterar data de início da disciplina", desc: "Uso raro e sensível — troca o início da disciplina. Sempre passa por aprovação." },
    { tipo: "reordenar_carrossel", titulo: "Reordenar / editar disciplinas", desc: "Muda a ordem, substitui, adiciona ou remove disciplinas do carrossel de um curso." },
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
async function calcularPrevia(body: Record<string, unknown>): Promise<{ linhas: unknown[]; aviso?: string } | null> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calcular-previa`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!resp.ok || json.error) {
    toast.error("Prévia falhou", { description: json.error ?? "Erro" });
    return null;
  }
  return { linhas: json.linhas, aviso: json.aviso };
}

function useSubmit(onDone: (id: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarSolicitacao,
    onSuccess: (id) => {
      toast.success("Solicitação criada", { description: "Um aprovador vai revisar." });
      qc.invalidateQueries();
      onDone(id);
    },
    onError: (err: Error) => toast.error("Falha ao criar", { description: err.message }),
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

function FormNovoCurso({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const [tipoCurso, setTipoCurso] = useState<TipoCurso>("pos_graduacao");
  const [codigo, setCodigo] = useState("");
  const [aguardandoCodigo, setAguardandoCodigo] = useState(false);
  const [sigla, setSigla] = useState("");
  const [siglaEditadaManualmente, setSiglaEditadaManualmente] = useState(false);
  const [nome, setNome] = useState("");
  const [escola, setEscola] = useState("");
  const [chDefault, setChDefault] = useState("20");
  const [diaSemana, setDiaSemana] = useState<"quinta" | "quarta">("quinta");
  const [anoEstreia, setAnoEstreia] = useState("");
  const [dataInicioE1, setDataInicioE1] = useState("");
  const [captacaoInicio, setCaptacaoInicio] = useState("");
  const [paCh, setPaCh] = useState("60");
  const [gerandoPrevia, setGerandoPrevia] = useState(false);
  // S4+S5 — linhas dinamicas de disciplinas com pre-requisito
  const [disciplinas, setDisciplinas] = useState<DisciplinaLinha[]>(() => [novaLinhaDisciplina(1, 20)]);
  const mut = useSubmit(onDone);

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
      const cursoMaster = {
        sigla: sigla.trim().toUpperCase(),
        curso: nome.trim(),
        diaSemanaDefault: diaSemana,
        paCh: parseInt(paCh, 10) || 60,
        paAnosElegiveis: [],
        paCodigoPrefixo: "",
        carrossel: disciplinasValidas.map((d) => ({
          ordem: d.ordem,
          disciplina: d.nome,
          codigoDisciplina: null,
          tipoOferta: d.tipo_oferta,
          ch: d.ch,
          liveEstudoCasoOffset: diaSemana === "quinta" ? 10 : 9,
          liveFechamentoOffset: diaSemana === "quinta" ? 17 : 16,
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
          pa_ch: parseInt(paCh, 10) || 60,
        }),
      },
      previa,
    });
  }

  // S8 — Template Excel: download + upload
  function baixarTemplate() {
    // CSV simples (aceita como planilha no Excel/Google Sheets)
    const rows = [
      "Ordem,Nome da disciplina,CH,Tipo (A/C),Tem pre-requisito",
      "1,Ex.: Admiravel Futuro Novo,20,C,nao",
      "2,Ex.: Estrategias de Mercado,20,A,nao",
      "3,,,,",
    ];
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "template-disciplinas.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const linhas = text.replace(/^﻿/, "").split(/\r?\n/).slice(1).filter((l) => l.trim());
    const parsed: DisciplinaLinha[] = linhas.map((linha, i) => {
      const [_ord, nomeCol, chCol, tipoCol, preCol] = linha.split(",");
      return {
        ordem: i + 1,
        nome: (nomeCol ?? "").trim(),
        ch: parseInt(chCol ?? "20", 10) || 20,
        tipo_oferta: ((tipoCol ?? "A").trim().toUpperCase() === "C" ? "C" : "A") as "A" | "C",
        tem_pre_requisito: /^(sim|s|true|1|yes)$/i.test((preCol ?? "").trim()),
      };
    }).filter((d) => d.nome.length > 0);
    if (parsed.length === 0) {
      toast.error("Arquivo vazio ou formato invalido", { description: "Baixe o template e siga o cabecalho." });
      return;
    }
    setDisciplinas(parsed);
    toast.success(`${parsed.length} disciplina(s) importadas`);
    e.target.value = "";
  }

  return (
    <Card>
      <CardHeader><CardTitle>Abertura de novo curso</CardTitle>
        <CardDescription>
          O curso será criado ao aprovar. Se você preencher a seção "Gerar ofertas do 1º ano", o motor calcula e grava as 16 entradas já no calendário.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* S1 — Tipo de curso primeiro */}
        <Campo label="Tipo de curso *">
          <RadioGroup value={tipoCurso} onValueChange={(v) => setTipoCurso(v as TipoCurso)} className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {TIPOS_CURSO_ORDENADOS.map((t) => (
              <label key={t.valor} className={`flex cursor-pointer flex-col gap-1 rounded-md border p-2 text-sm hover:bg-accent ${tipoCurso === t.valor ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={t.valor} />
                  <span className="font-medium">{t.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{t.desc}</span>
              </label>
            ))}
          </RadioGroup>
        </Campo>

        <Campo label="Nome do curso *">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo do curso" />
          {cursoDuplicado && (
            <div className="mt-1 flex gap-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Já existe curso com este nome ({cursoDuplicado.codigo}). Ajuste o nome ou considere continuar o curso existente.</span>
            </div>
          )}
        </Campo>

        <div className="grid gap-3 md:grid-cols-2">
          <Campo label={aguardandoCodigo ? "Código (aguardando criação)" : "Código do curso *"}>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="411-XXX" disabled={aguardandoCodigo} />
            <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={aguardandoCodigo} onChange={(e) => setAguardandoCodigo(e.target.checked)} />
              Aguardando criação de código
            </label>
          </Campo>
          <Campo label={`Sigla * (${siglaEditadaManualmente ? "editada" : "sugerida"})`}>
            <Input value={sigla} onChange={(e) => { setSigla(e.target.value.toUpperCase()); setSiglaEditadaManualmente(true); }} placeholder="SIG" maxLength={3} />
          </Campo>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label="Escola"><Input value={escola} onChange={(e) => setEscola(e.target.value)} placeholder="Ex.: IA" /></Campo>
          <Campo label="CH padrão por disciplina">
            <Select value={chDefault} onValueChange={setChDefault}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20h</SelectItem>
                <SelectItem value="24">24h</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
        </div>
        {/* S4+S5 — disciplinas dinamicas com pre-requisito, S8 template Excel */}
        <div className="rounded-md border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Disciplinas do carrossel</label>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Quantas?</span>
                <Input type="number" min={0} value={disciplinas.length} onChange={(e) => setQuantidade(parseInt(e.target.value, 10) || 0)} className="h-7 w-16" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={baixarTemplate}>
                <Download className="mr-1 h-3 w-3" />Template
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent">
                <Upload className="h-3 w-3" />Importar
                <input type="file" accept=".csv,.txt" className="hidden" onChange={upload} />
              </label>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {disciplinas.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Nenhuma disciplina. Clique em "+ Disciplina" ou importe da planilha.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 p-1 text-left">#</th>
                    <th className="p-1 text-left">Nome</th>
                    <th className="w-20 p-1">CH</th>
                    <th className="w-16 p-1">Tipo</th>
                    <th className="w-24 p-1 text-center">Pré-req?</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {disciplinas.map((d, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1 text-xs text-muted-foreground">{d.ordem}</td>
                      <td className="p-1"><Input value={d.nome} onChange={(e) => atualizarLinha(i, { nome: e.target.value })} placeholder="Nome da disciplina" className="h-8" /></td>
                      <td className="p-1"><Input type="number" min={0} max={200} value={d.ch} onChange={(e) => atualizarLinha(i, { ch: parseInt(e.target.value, 10) || 0 })} className="h-8" /></td>
                      <td className="p-1">
                        <Select value={d.tipo_oferta} onValueChange={(v) => atualizarLinha(i, { tipo_oferta: v as "A" | "C" })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">A (exclusiva)</SelectItem>
                            <SelectItem value="C">C (compartilhada)</SelectItem>
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
              <Plus className="mr-1 h-3 w-3" />Disciplina
            </Button>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">{disciplinasValidas.length} disciplina(s) com nome</span>
              <span className={`font-medium ${validacaoCh.ok ? "text-emerald-600" : "text-rose-600"}`}>
                Total: {chTotal}h {validacaoCh.ch_minima > 0 && `/ mínimo ${validacaoCh.ch_minima}h`}
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
          <div className="mb-2 font-medium text-sm">Gerar ofertas do 1º ano (opcional)</div>
          <p className="mb-3 text-xs text-muted-foreground">
            Preencha pra o motor calcular e cadastrar as 16 entradas do ano de estreia junto com o curso. Deixe em branco pra criar só o cadastro do curso.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo label="Ano de lançamento">
              <Input type="number" value={anoEstreia} onChange={(e) => setAnoEstreia(e.target.value)} placeholder="2027" />
            </Campo>
            <Campo label="Dia da semana das lives">
              <Select value={diaSemana} onValueChange={(v) => setDiaSemana(v as "quinta" | "quarta")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quinta">Quinta-feira</SelectItem>
                  <SelectItem value="quarta">Quarta-feira</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Campo label="Data início da E1 (âncora)">
              <Input type="date" value={dataInicioE1} onChange={(e) => setDataInicioE1(e.target.value)} />
            </Campo>
            <Campo label="Início da captação E1">
              <Input type="date" value={captacaoInicio} onChange={(e) => setCaptacaoInicio(e.target.value)} />
            </Campo>
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending || gerandoPrevia} onClick={submeter}>
            {(gerandoPrevia || mut.isPending) ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{gerandoPrevia ? "Calculando prévia…" : "Enviando…"}</> : "Enviar solicitação"}
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
  const [linha, setLinha] = useState<LinhaSelecionada | null>(null);
  const [campo, setCampo] = useState<string>("");
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const mut = useSubmit(onDone);

  const lives = linha ? livesDaLinha(linha.dados) : [];
  const inicio = linha ? CAMPO.inicio(linha.dados) : null;
  const fim = linha ? CAMPO.fim(linha.dados) : null;
  const foraDeJanela = !!(inicio && fim && novaData && (novaData < inicio || novaData > fim));
  const podeEnviar = linha && campo && novaData && motivo.trim() && !foraDeJanela;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alterar data de live</CardTitle>
        <CardDescription>Busque a turma, escolha qual live e a nova data. A nova data precisa cair dentro do período da disciplina.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Turma *">
          <SeletorCodigoTurma tenantId={tenantId} selecionada={linha} onSelecionar={(l) => { setLinha(l); setCampo(""); }} />
        </Campo>
        {linha && lives.length === 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            Esta turma não tem campos de LIVE cadastrados. Verifique se é o subtipo certo.
          </div>
        )}
        {linha && lives.length > 0 && (
          <Campo label="Qual live? *">
            <Select value={campo} onValueChange={setCampo}>
              <SelectTrigger><SelectValue placeholder="Escolha a live" /></SelectTrigger>
              <SelectContent>
                {lives.map((l) => (
                  <SelectItem key={l.campo} value={l.campo}>
                    {l.label} {l.valor ? `— hoje: ${l.valor}` : "(sem data)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        )}
        <Campo label="Nova data *">
          <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
        </Campo>
        {inicio && fim && (
          <div className="text-xs text-muted-foreground">Período da disciplina: {inicio} a {fim}.</div>
        )}
        {foraDeJanela && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>Data fora do período da disciplina. Se precisa mesmo dessa data, abra também uma alteração de <span className="font-medium">término da disciplina</span>.</div>
          </div>
        )}
        <Campo label="Motivo *">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Ex.: professor viajou; reagendar pra semana seguinte." />
        </Campo>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "alterar_data_live",
            aba: "disciplinas", ano: linha!.ano,
            payload: { chave_natural: linha!.chave_natural, campo, nova_data: novaData, motivo: motivo.trim() },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Enviar solicitação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FormAlterarDataTermino({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const [linha, setLinha] = useState<LinhaSelecionada | null>(null);
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const mut = useSubmit(onDone);

  const terminoAtual = linha ? CAMPO.fim(linha.dados) : null;
  const podeEnviar = linha && novaData && motivo.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alterar data de término da disciplina</CardTitle>
        <CardDescription>Prorroga (ou antecipa) o término da disciplina. A data de entrega da atividade avaliativa é atualizada junto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Turma *">
          <SeletorCodigoTurma tenantId={tenantId} selecionada={linha} onSelecionar={setLinha} />
        </Campo>
        {linha && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>Alterar o término da disciplina <span className="font-medium">também prorroga a entrega da atividade avaliativa</span> (mesma linha, campo QUESTIONÁRIO SEMANA 4).</div>
            </div>
          </div>
        )}
        <Campo label="Nova data de término *">
          <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
        </Campo>
        {terminoAtual && <div className="text-xs text-muted-foreground">Término atual: {terminoAtual}.</div>}
        <Campo label="Motivo *">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        </Campo>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "alterar_data_termino",
            aba: "disciplinas", ano: linha!.ano,
            payload: { chave_natural: linha!.chave_natural, campo: CAMPO.termino, nova_data: novaData, motivo: motivo.trim() },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Enviar solicitação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FormAlterarDataCorrecao({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const [linha, setLinha] = useState<LinhaSelecionada | null>(null);
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const mut = useSubmit(onDone);

  const correcaoAtual = linha ? String((linha.dados as Record<string, unknown>)[CAMPO.correcao] ?? "") : "";
  const podeEnviar = linha && novaData && motivo.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alterar data de correção do professor</CardTitle>
        <CardDescription>Muda a data limite pra correção da atividade avaliativa da turma.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Turma *">
          <SeletorCodigoTurma tenantId={tenantId} selecionada={linha} onSelecionar={setLinha} />
        </Campo>
        <Campo label="Nova data de correção *">
          <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
        </Campo>
        {correcaoAtual && <div className="text-xs text-muted-foreground">Data atual: {correcaoAtual}.</div>}
        <Campo label="Motivo *">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        </Campo>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "alterar_data_correcao",
            aba: "disciplinas", ano: linha!.ano,
            payload: { chave_natural: linha!.chave_natural, campo: CAMPO.correcao, nova_data: novaData, motivo: motivo.trim() },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Enviar solicitação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FormAlterarDataInicio({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const [linha, setLinha] = useState<LinhaSelecionada | null>(null);
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [propagar, setPropagar] = useState(false);
  const mut = useSubmit(onDone);

  const inicioAtual = linha ? CAMPO.inicio(linha.dados) : null;
  const podeEnviar = linha && novaData && motivo.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alterar data de início da disciplina</CardTitle>
        <CardDescription>Cenário raro e sensível — sempre passa por aprovação manual.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>Este é o subtipo com <span className="font-medium">maior impacto no calendário</span>. Confirme com o time antes de solicitar.</div>
          </div>
        </div>
        <Campo label="Turma *">
          <SeletorCodigoTurma tenantId={tenantId} selecionada={linha} onSelecionar={setLinha} />
        </Campo>
        <Campo label="Novo início *">
          <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
        </Campo>
        {inicioAtual && <div className="text-xs text-muted-foreground">Início atual: {inicioAtual}.</div>}
        <div className="flex items-start gap-2 rounded-md border p-3">
          <Checkbox id="propagar" checked={propagar} onCheckedChange={(v) => setPropagar(!!v)} />
          <label htmlFor="propagar" className="text-sm">
            <span className="font-medium">Propagar mudança pras disciplinas seguintes do mesmo curso/ano</span>
            <div className="text-xs text-muted-foreground">Default = não. Marque só se o time confirmou. Motor reprojeta as próximas.</div>
          </label>
        </div>
        <Campo label="Motivo *">
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
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Enviar solicitação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Reordenar Carrossel ----------------
function FormReordenar({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const [cursoId, setCursoId] = useState<string>("");
  const [ordemFinalTxt, setOrdemFinalTxt] = useState("");
  const mut = useSubmit(onDone);

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
      <CardHeader><CardTitle>Reordenar / editar disciplinas</CardTitle>
        <CardDescription>Redefina a lista completa das disciplinas do carrossel na ordem desejada. Cole uma disciplina por linha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Curso *">
          <Select value={cursoId} onValueChange={(v) => {
            setCursoId(v);
            // Pre-preenche com a ordem atual se ainda estiver vazio
          }}>
            <SelectTrigger><SelectValue placeholder="Escolher curso" /></SelectTrigger>
            <SelectContent>
              {cursos?.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
        {disciplinasAtuais && disciplinasAtuais.length > 0 && (
          <div className="rounded-md border bg-muted/20 p-3 text-xs">
            <div className="mb-1 font-medium">Ordem atual ({disciplinasAtuais.length}):</div>
            <ol className="ml-4 list-decimal space-y-0.5">
              {disciplinasAtuais.map((d, i) => <li key={i}>{d.nome}</li>)}
            </ol>
            <Button variant="link" size="sm" className="mt-2 h-auto p-0" onClick={() => setOrdemFinalTxt(disciplinasAtuais.map((d) => d.nome).join("\n"))}>
              Copiar pra edição
            </Button>
          </div>
        )}
        <Campo label="Nova ordem * (uma disciplina por linha)">
          <Textarea value={ordemFinalTxt} onChange={(e) => setOrdemFinalTxt(e.target.value)} rows={16} placeholder="1. Disciplina A&#10;2. Disciplina B" />
        </Campo>
        <div className="text-xs text-muted-foreground">{ordemFinal.length} disciplina(s) na nova ordem.</div>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "reordenar_carrossel", curso_id: cursoId,
            payload: { curso_id: cursoId, ordem_final: ordemFinal },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Enviar solicitação"}
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
