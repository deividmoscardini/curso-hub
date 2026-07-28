
-- Enums
CREATE TYPE public.tipo_area_enum AS ENUM ('interna','externa');
CREATE TYPE public.papel_enum AS ENUM ('solicitante','aprovador');
CREATE TYPE public.status_solicitacao_enum AS ENUM ('pendente','aprovado','rejeitado');
CREATE TYPE public.tipo_disciplina_enum AS ENUM ('com_pre_requisito','sem_pre_requisito');
CREATE TYPE public.dia_semana_enum AS ENUM ('segunda','terca','quarta','quinta','sexta','sabado');

-- perfis
CREATE TABLE public.perfis (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  tipo_area public.tipo_area_enum NOT NULL DEFAULT 'externa',
  area TEXT NOT NULL DEFAULT '',
  papel public.papel_enum NOT NULL DEFAULT 'solicitante',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfis TO authenticated;
GRANT ALL ON public.perfis TO service_role;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- Função para checar papel sem recursão RLS
CREATE OR REPLACE FUNCTION public.tem_papel(_user_id UUID, _papel public.papel_enum)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis WHERE id = _user_id AND papel = _papel);
$$;

CREATE POLICY "perfis_select_self_or_aprovador" ON public.perfis FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.tem_papel(auth.uid(), 'aprovador'));
CREATE POLICY "perfis_update_self" ON public.perfis FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "perfis_insert_self" ON public.perfis FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- solicitacoes_abertura_curso
CREATE TABLE public.solicitacoes_abertura_curso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  solicitante_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  nome_curso TEXT NOT NULL,
  instituicao TEXT NOT NULL,
  nome_solicitante TEXT NOT NULL,
  email_solicitante TEXT NOT NULL,
  justificativa TEXT,
  arquivo_url TEXT,
  arquivo_nome_original TEXT,
  status public.status_solicitacao_enum NOT NULL DEFAULT 'pendente',
  aprovado_por UUID REFERENCES public.perfis(id),
  aprovado_em TIMESTAMPTZ,
  motivo_rejeicao TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_abertura_curso TO authenticated;
GRANT ALL ON public.solicitacoes_abertura_curso TO service_role;
ALTER TABLE public.solicitacoes_abertura_curso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sol_select_dono_ou_aprovador" ON public.solicitacoes_abertura_curso FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid() OR public.tem_papel(auth.uid(), 'aprovador'));
CREATE POLICY "sol_insert_dono" ON public.solicitacoes_abertura_curso FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());
CREATE POLICY "sol_update_aprovador" ON public.solicitacoes_abertura_curso FOR UPDATE TO authenticated
  USING (public.tem_papel(auth.uid(), 'aprovador'))
  WITH CHECK (public.tem_papel(auth.uid(), 'aprovador'));

-- disciplinas_solicitadas
CREATE TABLE public.disciplinas_solicitadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES public.solicitacoes_abertura_curso(id) ON DELETE CASCADE,
  nome_disciplina TEXT NOT NULL,
  carga_horaria INTEGER NOT NULL,
  sequencia_oferta INTEGER NOT NULL,
  tipo public.tipo_disciplina_enum NOT NULL,
  data_inicio_captacao DATE NOT NULL,
  duracao_captacao_dias INTEGER NOT NULL,
  data_fim_captacao DATE NOT NULL,
  data_inicio_aulas DATE NOT NULL,
  duracao_disciplina_dias INTEGER NOT NULL,
  dias_lives INTEGER NOT NULL,
  semana_live INTEGER NOT NULL,
  dia_semana_live public.dia_semana_enum NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinas_solicitadas TO authenticated;
GRANT ALL ON public.disciplinas_solicitadas TO service_role;
ALTER TABLE public.disciplinas_solicitadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disc_select_dono_ou_aprovador" ON public.disciplinas_solicitadas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.solicitacoes_abertura_curso s
    WHERE s.id = solicitacao_id
      AND (s.solicitante_id = auth.uid() OR public.tem_papel(auth.uid(), 'aprovador'))
  ));
CREATE POLICY "disc_insert_dono" ON public.disciplinas_solicitadas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.solicitacoes_abertura_curso s
    WHERE s.id = solicitacao_id AND s.solicitante_id = auth.uid()
  ));
CREATE POLICY "disc_delete_dono" ON public.disciplinas_solicitadas FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.solicitacoes_abertura_curso s
    WHERE s.id = solicitacao_id AND s.solicitante_id = auth.uid()
  ));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_sol_atualizado_em BEFORE UPDATE ON public.solicitacoes_abertura_curso
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- Trigger novo usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, email, tipo_area, papel, area)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'externa',
    'solicitante',
    ''
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
