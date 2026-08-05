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
import { Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solicitacoes/nova")({
  head: () => ({ meta: [{ title: "Nova solicitação" }] }),
  component: NovaSolicitacaoPage,
});

type TipoSolicitacao = "novo_curso" | "ajuste_ancora" | "ajuste_manual" | "reordenar_carrossel" | "cancelar_oferta";
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
      {tipo === "ajuste_ancora" && <FormAjusteAncora tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
      {tipo === "ajuste_manual" && <FormAjusteManual tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
      {tipo === "reordenar_carrossel" && <FormReordenar tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
      {tipo === "cancelar_oferta" && <FormCancelarOferta tenantId={tenantId} onDone={(id) => navigate({ to: "/solicitacoes/$id", params: { id } })} />}
    </div>
  );
}

function SelectorTipo({ onEscolher }: { onEscolher: (t: TipoSolicitacao) => void }) {
  const opcoes: { tipo: TipoSolicitacao; titulo: string; desc: string }[] = [
    { tipo: "novo_curso", titulo: "Abertura de novo curso", desc: "Cadastra um curso novo com suas disciplinas. Ofertas do ano são geradas em passo seguinte (Alteração de datas)." },
    { tipo: "ajuste_ancora", titulo: "Alteração de datas — âncora do ano", desc: "Recalcula toda uma aba/ano a partir de uma nova data-âncora. Também usado para popular ofertas de um novo ano." },
    { tipo: "ajuste_manual", titulo: "Alteração de datas — célula específica", desc: "Muda uma data pontual em uma oferta existente." },
    { tipo: "reordenar_carrossel", titulo: "Reordenar / editar disciplinas", desc: "Muda a ordem, substitui, adiciona ou remove disciplinas do carrossel de um curso." },
    { tipo: "cancelar_oferta", titulo: "Cancelar oferta", desc: "Remove uma oferta específica do calendário." },
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
    status: "pendente",
  }).select("id").single();
  if (error) throw error;
  return data.id;
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
function FormNovoCurso({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const [codigo, setCodigo] = useState("");
  const [sigla, setSigla] = useState("");
  const [nome, setNome] = useState("");
  const [escola, setEscola] = useState("");
  const [disciplinasTxt, setDisciplinasTxt] = useState("");
  const mut = useSubmit(onDone);

  const disciplinas = disciplinasTxt
    .split("\n").map((s) => s.trim()).filter(Boolean)
    .map((nome, i) => ({ ordem: i + 1, nome, ch: 20, tipo_oferta: "A" as const }));

  const podeEnviar = codigo.trim() && sigla.trim() && nome.trim() && disciplinas.length > 0;

  return (
    <Card>
      <CardHeader><CardTitle>Novo curso</CardTitle>
        <CardDescription>O curso será criado após aprovação. Depois, abra uma solicitação de "Alteração de datas — âncora" pra popular as ofertas do primeiro ano.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Código do curso *"><Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="411-XXX" /></Campo>
        <Campo label="Sigla *"><Input value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="SIG" /></Campo>
        <Campo label="Nome *"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo do curso" /></Campo>
        <Campo label="Escola"><Input value={escola} onChange={(e) => setEscola(e.target.value)} placeholder="Ex.: IA" /></Campo>
        <Campo label="Disciplinas do carrossel * (uma por linha, na ordem)">
          <Textarea value={disciplinasTxt} onChange={(e) => setDisciplinasTxt(e.target.value)}
            rows={12} placeholder={`1. Admirável Futuro Novo\n2. ...`} />
        </Campo>
        <div className="text-xs text-muted-foreground">{disciplinas.length} disciplina(s) detectada(s).</div>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "novo_curso",
            payload: { codigo: codigo.trim(), sigla: sigla.trim().toUpperCase(), escola: escola.trim() || null, nome: nome.trim(), disciplinas },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Enviar solicitação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Ajuste Âncora ----------------
function FormAjusteAncora({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const [aba, setAba] = useState<Aba>("disciplinas");
  const [ano, setAno] = useState("");
  const [ancora, setAncora] = useState("");
  const mut = useSubmit(onDone);

  const podeEnviar = ano && /^\d{4}$/.test(ano) && /^\d{4}-\d{2}-\d{2}$/.test(ancora);

  return (
    <Card>
      <CardHeader><CardTitle>Alteração de datas — nova âncora do ano</CardTitle>
        <CardDescription>Recalcula toda a aba/ano a partir da nova data-âncora. Também usado pra criar as ofertas de um novo ano.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Aba *">
          <Select value={aba} onValueChange={(v) => setAba(v as Aba)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="disciplinas">Disciplinas</SelectItem>
              <SelectItem value="projeto_aplicacao">Projeto de Aplicação</SelectItem>
              <SelectItem value="prova_substitutiva">Prova Substitutiva</SelectItem>
              <SelectItem value="fechamento">Fechamento de turmas</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo label="Ano *"><Input type="number" value={ano} onChange={(e) => setAno(e.target.value)} placeholder="2029" /></Campo>
        <Campo label="Nova âncora * (AAAA-MM-DD)"><Input type="date" value={ancora} onChange={(e) => setAncora(e.target.value)} /></Campo>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "ajuste_ancora", aba, ano: parseInt(ano, 10),
            payload: { aba, ano: parseInt(ano, 10), ancora },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Enviar solicitação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Ajuste Manual ----------------
function FormAjusteManual({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const [chaveNatural, setChaveNatural] = useState("");
  const [campo, setCampo] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const mut = useSubmit(onDone);

  const podeEnviar = chaveNatural.trim() && campo.trim() && novoValor.trim();

  return (
    <Card>
      <CardHeader><CardTitle>Alteração de datas — célula específica</CardTitle>
        <CardDescription>Muda um valor pontual em uma oferta já cadastrada.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Chave natural da linha *">
          <Input value={chaveNatural} onChange={(e) => setChaveNatural(e.target.value)} placeholder="Ex.: disciplinas-2027-411-393-E5-3" />
        </Campo>
        <Campo label="Campo/coluna *"><Input value={campo} onChange={(e) => setCampo(e.target.value)} placeholder="Ex.: DATA INÍCIO" /></Campo>
        <Campo label="Novo valor *"><Input value={novoValor} onChange={(e) => setNovoValor(e.target.value)} /></Campo>
        <Campo label="Observação"><Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} /></Campo>
        <div className="flex justify-end">
          <Button disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "ajuste_manual",
            payload: { chave_natural: chaveNatural.trim(), campo: campo.trim(), novo_valor: novoValor.trim(), observacao },
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

// ---------------- Cancelar Oferta ----------------
function FormCancelarOferta({ tenantId, onDone }: { tenantId: string; onDone: (id: string) => void }) {
  const [chaveNatural, setChaveNatural] = useState("");
  const [motivo, setMotivo] = useState("");
  const mut = useSubmit(onDone);

  const podeEnviar = chaveNatural.trim() && motivo.trim();

  return (
    <Card>
      <CardHeader><CardTitle>Cancelar oferta</CardTitle>
        <CardDescription>Remove uma oferta específica do calendário após aprovação.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Chave natural *"><Input value={chaveNatural} onChange={(e) => setChaveNatural(e.target.value)} placeholder="Ex.: disciplinas-2027-411-393-E5-3" /></Campo>
        <Campo label="Motivo *"><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} /></Campo>
        <div className="flex justify-end">
          <Button variant="destructive" disabled={!podeEnviar || mut.isPending} onClick={() => mut.mutate({
            tenant_id: tenantId, tipo: "cancelar_oferta",
            payload: { chave_natural: chaveNatural.trim(), motivo: motivo.trim() },
          })}>
            {mut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Enviar solicitação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
