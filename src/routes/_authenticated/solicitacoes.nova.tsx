import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solicitacoes/nova")({
  head: () => ({ meta: [{ title: "Nova solicitação" }] }),
  component: NovaSolicitacao,
});

const disciplinaSchema = z.object({
  nome_disciplina: z.string().min(1, "Obrigatório"),
  carga_horaria: z.coerce.number().int().min(1, "Obrigatório"),
  sequencia_oferta: z.coerce.number().int().min(1, "Obrigatório"),
  tipo: z.enum(["com_pre_requisito", "sem_pre_requisito"]),
  data_inicio_captacao: z.string().min(1, "Obrigatório"),
  duracao_captacao_dias: z.coerce.number().int().min(1, "Obrigatório"),
  data_fim_captacao: z.string().min(1, "Obrigatório"),
  data_inicio_aulas: z.string().min(1, "Obrigatório"),
  duracao_disciplina_dias: z.coerce.number().int().min(1, "Obrigatório"),
  dias_lives: z.coerce.number().int().min(0),
  semana_live: z.coerce.number().int().min(1),
  dia_semana_live: z.enum(["segunda", "terca", "quarta", "quinta", "sexta", "sabado"]),
});

const formSchema = z.object({
  nome_curso: z.string().min(1, "Obrigatório"),
  instituicao: z.string().min(1, "Obrigatório"),
  nome_solicitante: z.string().min(1, "Obrigatório"),
  email_solicitante: z.string().email("E-mail inválido"),
  justificativa: z.string().optional(),
  disciplinas: z.array(disciplinaSchema).min(1, "Adicione ao menos uma disciplina"),
});

type FormData = z.infer<typeof formSchema>;

const disciplinaVazia = {
  nome_disciplina: "",
  carga_horaria: "" as unknown as number,
  sequencia_oferta: "" as unknown as number,
  tipo: "sem_pre_requisito" as const,
  data_inicio_captacao: "",
  duracao_captacao_dias: "" as unknown as number,
  data_fim_captacao: "",
  data_inicio_aulas: "",
  duracao_disciplina_dias: "" as unknown as number,
  dias_lives: "" as unknown as number,
  semana_live: "" as unknown as number,
  dia_semana_live: "segunda" as const,
};

function NovaSolicitacao() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: perfil } = useQuery({
    queryKey: ["perfil", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("perfis").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_curso: "",
      instituicao: "",
      nome_solicitante: user.email ?? "",
      email_solicitante: user.email ?? "",
      justificativa: "",
      disciplinas: [disciplinaVazia],
    },
  });

  // Preenche automaticamente nome/e-mail quando o perfil chega
  const [preenchido, setPreenchido] = useState(false);
  if (perfil && !preenchido) {
    form.setValue("nome_solicitante", perfil.nome || perfil.email);
    form.setValue("email_solicitante", perfil.email);
    setPreenchido(true);
  }

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "disciplinas" });

  const onSubmit = async (values: FormData) => {
    setSubmitting(true);
    try {
      let arquivo_url: string | null = null;
      let arquivo_nome_original: string | null = null;

      if (arquivo) {
        const ext = arquivo.name.split(".").pop()?.toLowerCase();
        if (ext !== "xlsx" && ext !== "csv") {
          toast.error("Arquivo deve ser .xlsx ou .csv");
          setSubmitting(false);
          return;
        }
        const path = `${user.id}/${crypto.randomUUID()}-${arquivo.name}`;
        const { error: upErr } = await supabase.storage
          .from("solicitacoes-arquivos")
          .upload(path, arquivo);
        if (upErr) throw upErr;
        arquivo_url = path;
        arquivo_nome_original = arquivo.name;
      }

      const { data: sol, error: solErr } = await supabase
        .from("solicitacoes_abertura_curso")
        .insert({
          solicitante_id: user.id,
          nome_curso: values.nome_curso,
          instituicao: values.instituicao,
          nome_solicitante: values.nome_solicitante,
          email_solicitante: values.email_solicitante,
          justificativa: values.justificativa || null,
          arquivo_url,
          arquivo_nome_original,
        })
        .select("id")
        .single();
      if (solErr) throw solErr;

      const disciplinas = values.disciplinas.map((d) => ({ ...d, solicitacao_id: sol.id }));
      const { error: dErr } = await supabase.from("disciplinas_solicitadas").insert(disciplinas);
      if (dErr) throw dErr;

      toast.success("Solicitação enviada!");
      navigate({ to: "/solicitacoes/$id", params: { id: sol.id } });
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nova solicitação</h1>
        <p className="text-sm text-muted-foreground">
          Preencha os dados do curso e das disciplinas.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados gerais</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nome do curso" error={form.formState.errors.nome_curso?.message}>
              <Input {...form.register("nome_curso")} />
            </Field>
            <Field label="Instituição parceira" error={form.formState.errors.instituicao?.message}>
              <Input {...form.register("instituicao")} />
            </Field>
            <Field label="Nome do solicitante" error={form.formState.errors.nome_solicitante?.message}>
              <Input {...form.register("nome_solicitante")} />
            </Field>
            <Field label="E-mail do solicitante" error={form.formState.errors.email_solicitante?.message}>
              <Input type="email" {...form.register("email_solicitante")} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Justificativa / observações (opcional)">
                <Textarea rows={3} {...form.register("justificativa")} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Arquivo padronizado (.xlsx ou .csv, opcional)">
                <Input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
                {arquivo && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selecionado: {arquivo.name}
                  </p>
                )}
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Disciplinas</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => append(disciplinaVazia)}
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar disciplina
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {fields.map((field, idx) => (
              <div key={field.id} className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium">Disciplina {idx + 1}</h3>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(idx)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Remover
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <Field
                      label="Nome da disciplina"
                      error={form.formState.errors.disciplinas?.[idx]?.nome_disciplina?.message}
                    >
                      <Input {...form.register(`disciplinas.${idx}.nome_disciplina`)} />
                    </Field>
                  </div>
                  <Field
                    label="Carga horária"
                    error={form.formState.errors.disciplinas?.[idx]?.carga_horaria?.message}
                  >
                    <Input
                      type="number"
                      min={1}
                      {...form.register(`disciplinas.${idx}.carga_horaria`)}
                    />
                  </Field>
                  <Field
                    label="Sequência de oferta"
                    error={form.formState.errors.disciplinas?.[idx]?.sequencia_oferta?.message}
                  >
                    <Input
                      type="number"
                      min={1}
                      {...form.register(`disciplinas.${idx}.sequencia_oferta`)}
                    />
                  </Field>
                  <Field label="Tipo">
                    <Select
                      value={form.watch(`disciplinas.${idx}.tipo`)}
                      onValueChange={(v) =>
                        form.setValue(
                          `disciplinas.${idx}.tipo`,
                          v as "com_pre_requisito" | "sem_pre_requisito",
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="com_pre_requisito">Com pré-requisito</SelectItem>
                        <SelectItem value="sem_pre_requisito">Sem pré-requisito</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label="Dia da semana da live"
                  >
                    <Select
                      value={form.watch(`disciplinas.${idx}.dia_semana_live`)}
                      onValueChange={(v) =>
                        form.setValue(
                          `disciplinas.${idx}.dia_semana_live`,
                          v as "segunda" | "terca" | "quarta" | "quinta" | "sexta" | "sabado",
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="segunda">Segunda</SelectItem>
                        <SelectItem value="terca">Terça</SelectItem>
                        <SelectItem value="quarta">Quarta</SelectItem>
                        <SelectItem value="quinta">Quinta</SelectItem>
                        <SelectItem value="sexta">Sexta</SelectItem>
                        <SelectItem value="sabado">Sábado</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label="Início da captação"
                    error={form.formState.errors.disciplinas?.[idx]?.data_inicio_captacao?.message}
                  >
                    <Input
                      type="date"
                      {...form.register(`disciplinas.${idx}.data_inicio_captacao`)}
                    />
                  </Field>
                  <Field
                    label="Duração da captação (dias)"
                    error={form.formState.errors.disciplinas?.[idx]?.duracao_captacao_dias?.message}
                  >
                    <Input
                      type="number"
                      min={1}
                      {...form.register(`disciplinas.${idx}.duracao_captacao_dias`)}
                    />
                  </Field>
                  <Field
                    label="Fim da captação"
                    error={form.formState.errors.disciplinas?.[idx]?.data_fim_captacao?.message}
                  >
                    <Input
                      type="date"
                      {...form.register(`disciplinas.${idx}.data_fim_captacao`)}
                    />
                  </Field>
                  <Field
                    label="Início das aulas"
                    error={form.formState.errors.disciplinas?.[idx]?.data_inicio_aulas?.message}
                  >
                    <Input
                      type="date"
                      {...form.register(`disciplinas.${idx}.data_inicio_aulas`)}
                    />
                  </Field>
                  <Field
                    label="Duração da disciplina (dias)"
                    error={
                      form.formState.errors.disciplinas?.[idx]?.duracao_disciplina_dias?.message
                    }
                  >
                    <Input
                      type="number"
                      min={1}
                      {...form.register(`disciplinas.${idx}.duracao_disciplina_dias`)}
                    />
                  </Field>
                  <Field label="Dias de lives">
                    <Input
                      type="number"
                      min={0}
                      {...form.register(`disciplinas.${idx}.dias_lives`)}
                    />
                  </Field>
                  <Field label="Semana da live">
                    <Input
                      type="number"
                      min={1}
                      {...form.register(`disciplinas.${idx}.semana_live`)}
                    />
                  </Field>
                </div>
              </div>
            ))}
            {form.formState.errors.disciplinas?.message && (
              <p className="text-sm text-destructive">{form.formState.errors.disciplinas.message}</p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/solicitacoes" })}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar solicitação"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
