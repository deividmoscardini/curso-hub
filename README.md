# Curso Hub

Quero criar do zero uma plataforma para solicitação de abertura de novos cursos acadêmicos (mesmo domínio do calendário 411 PUC RIO COLLAB da +A Educação — cursos de pós-graduação em parceria com instituições como PUC Rio, PUC PR, ESPM, FDC, Artmed, HCor). Preciso de: login com Supabase Auth, perfis de usuário com responsabilidades diferentes, um formulário de solicitação com upload de arquivo, e um painel de aprovação. Nada deve ser processado automaticamente sem aprovação — o objetivo inicial é só capturar e organizar os pedidos.

Perfis e responsabilidades

Cada usuário logado tem um perfil com:

tipo_area: interna (times da +A Educação) ou externa (instituição parceira solicitando a abertura de um curso).

area: nome do time ou da instituição (texto livre).

papel: solicitante (só cria e acompanha pedidos) ou aprovador (revisa, aprova ou rejeita).

Regra de acesso: solicitante só vê as próprias solicitações; aprovador vê e decide todas. Todo usuário novo entra por padrão como externa / solicitante — promover alguém a interna e/ou aprovador é uma ação manual (ex.: via painel do Supabase), não algo que o próprio usuário consegue fazer sozinho.

Tela 1 — Solicitar abertura de curso

O formulário tem duas partes: dados gerais do pedido, e depois os dados da disciplina (uma solicitação pode ter mais de uma disciplina — permitir adicionar várias linhas de disciplina dentro da mesma solicitação, tipo uma lista repetível, já que um curso novo normalmente abre com várias disciplinas de uma vez).

Dados gerais da solicitação:

Nome do curso (texto/alfanumérico, obrigatório)

Instituição parceira (texto, obrigatório)

Nome e e-mail do solicitante (pode vir do login, mas confirmar em tela)

Justificativa / observações (texto livre, opcional)

Upload de um arquivo (o "arquivo padronizado") — [DEFINIR DEPOIS: a estrutura desse arquivo ainda não existe. Por enquanto, aceitar qualquer arquivo .xlsx ou .csv, guardar no Supabase Storage, e apenas exibir o nome do arquivo enviado — sem validar ou ler o conteúdo.]

Por disciplina (repetível — um curso pode ter N disciplinas na mesma solicitação):

Nome da disciplina — texto/alfanumérico, obrigatório

Carga horária da disciplina — numérico

Sequência de oferta — numérico (posição da disciplina na ordem/carrossel do curso)

Tipo — seleção: "com pré-requisito" ou "sem pré-requisito"

Data de início da captação — data

Duração da pista de captação (em dias) — numérico

Data final da captação — data

Data de início das aulas — data

Tempo de duração da disciplina (em dias) — numérico

Dias de lives — numérico (quantidade de lives da disciplina)

Qual semana de live (dentro da duração da disciplina) — numérico (ex.: semana 2 de 4)

Dia da semana previsto para a live — seleção (segunda a sábado)

Validação de tipos no formulário:

Campos de "dias" (carga horária, sequência de oferta, duração da pista de captação, tempo de duração da disciplina, dias de lives, qual semana de live) são todos numéricos — bloquear entrada de texto não numérico.

Nome do curso e nome da disciplina são alfanuméricos (texto livre).

Datas (início/fim de captação, início das aulas) usam um seletor de data, não texto livre.

Depois de enviar, mostrar a lista "Minhas solicitações" (do próprio usuário), com data, nome do curso, quantidade de disciplinas, status (pendente/aprovado/rejeitado, com cores diferentes) e um link para reabrir os detalhes (incluindo a lista de disciplinas informadas).

Tela 2 — Painel de aprovação (só papel = 'aprovador')

Lista de solicitações com status pendente, mais recentes primeiro.

Ao abrir uma: dados gerais do pedido, a tabela de disciplinas informadas (uma linha por disciplina, todas as colunas listadas na Tela 1), o arquivo anexado (com link para baixar/visualizar), e quem pediu (nome, e-mail, área, tipo de área).

Botões "Aprovar" e "Rejeitar" (rejeitar exige motivo em texto). A decisão vale para a solicitação inteira (todas as disciplinas daquele pedido).

Uma aba de histórico com solicitações já decididas.

Banco de dados (Supabase)

Três tabelas:

perfis: id (referencia auth.users), nome, email, tipo_area (interna/externa), area, papel (solicitante/aprovador), criado_em.

solicitacoes_abertura_curso: id, criado_em, atualizado_em, solicitante_id (referencia perfis), nome_curso (texto), instituicao (texto), justificativa (texto), arquivo_url (path no Supabase Storage), arquivo_nome_original (texto), status (pendente/aprovado/rejeitado), aprovado_por, aprovado_em, motivo_rejeicao.

disciplinas_solicitadas (uma linha por disciplina, várias por solicitação): id, solicitacao_id (referencia solicitacoes_abertura_curso, on delete cascade), nome_disciplina (texto), carga_horaria (numérico), sequencia_oferta (numérico), tipo (com_pre_requisito/sem_pre_requisito), data_inicio_captacao (data), duracao_captacao_dias (numérico), data_fim_captacao (data), data_inicio_aulas (data), duracao_disciplina_dias (numérico), dias_lives (numérico), semana_live (numérico), dia_semana_live (segunda/terca/quarta/quinta/sexta/sabado).

Configurar RLS: solicitante só lê/cria as próprias linhas (em solicitacoes_abertura_curso e, por join, em disciplinas_solicitadas); aprovador lê e atualiza todas. Criar um bucket de Storage (privado) para os arquivos anexados, com política equivalente (dono do arquivo ou aprovador podem baixar).

Criar também a função/trigger padrão de perfil automático no primeiro login (perfil criado como externa/solicitante por padrão).

Estilo

Interface simples e direta, em português, sem elementos decorativos — ferramenta operacional interna. Layout de painel administrativo comum (sidebar + conteúdo) é suficiente.

Fora de escopo por enquanto

Não implementar nenhuma geração automática de calendário a partir da solicitação aprovada — isso depende de regras que ainda estão sendo definidas em outro projeto (calendário 411 PUC RIO COLLAB). Por ora, a plataforma só precisa levar um pedido de "enviado" a "aprovado/rejeitado" de forma organizada.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e62e5829-7fb3-4993-8285-e61214a21426).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
