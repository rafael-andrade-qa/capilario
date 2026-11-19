# Projeto Capilar

Diário fotográfico capilar pessoal, em português, pensado para o celular. Registre o cabelo em
**Molhado**, **Seco** e **Dia seguinte**, com até quatro ângulos (**Frente**, **Esquerdo**,
**Direito**, **Costas**), e compare duas etapas lado a lado no mesmo ângulo.

No comparador você escolhe a etapa primeiro. Molhado só se compara com Molhado. Seco e Dia seguinte
se comparam com o mesmo tipo e também entre si, para ver como o Seco amanheceu.

- **Frontend:** React + TypeScript + Vite, roteamento por hash, PWA instalável.
- **Backend gerenciado:** Supabase (Auth com e-mail e senha, Postgres com RLS, Storage privado).
- **Hospedagem:** GitHub Pages via GitHub Actions, em subcaminho (`/<repositório>/`).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | Instala dependências (lockfile incluído) |
| `npm run dev` | App em http://localhost:5173 usando `.env.local` |
| `npm run build` | Typecheck + build de produção em `dist/` |
| `npm run typecheck` | Só a tipagem |
| `npm test` | Testes unitários (ângulos, comparador, produto, validação de arquivos) |
| `npx supabase start` | Sobe o Supabase local no Docker e aplica as migrações |
| `npm run test:integration` | Backend real local: RLS, duas contas, idempotência, limites do bucket |
| `npm run test:e2e` | Critérios A1–A9 no Chrome (viewport de celular), build no subcaminho `/projeto-capilar/` |
| `npm run icons` | Regera os ícones PNG do PWA |

## Rodar localmente (sem conta na nuvem)

Requer Node 22+ e Docker Desktop.

```bash
npm install
npx supabase start          # primeira vez baixa as imagens (alguns minutos)
cp .env.example .env.local  # preencha com a URL e a PUBLISHABLE_KEY que o comando acima mostra
npm run dev
```

O cadastro público está desligado (`enable_signup = false`). Crie um usuário local no Studio
(http://127.0.0.1:54323 → Authentication → Add user → *Auto confirm*) e entre no app.

## Configurar o Supabase na nuvem

1. Crie um projeto em https://supabase.com/dashboard.
2. **Aplicar as migrações** (tabelas, restrições, RLS, bucket, políticas do Storage e as funções `finalize_stage` e `delete_stage`):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```
   Alternativa sem CLI: cole, em ordem, os arquivos de `supabase/migrations/` no SQL Editor.
3. **Desligar cadastro público:** Authentication → Sign In / Providers → desmarque *Allow new users to sign up*.
4. **Criar a conta pessoal:** Authentication → Users → *Add user* → *Create new user*, com e-mail, senha e *Auto Confirm User*.
5. **Chaves:** Project Settings → API Keys. Use só a **Publishable key** (`sb_publishable_...`) ou a *anon* legada.
   A *secret/service_role* nunca vai para o app, o build ou o repositório.
6. **Limite de upload:** o bucket `capilar-photos` aceita JPEG/PNG/WebP até 15 MiB. Confira em
   Storage → Settings que o limite global do projeto é ≥ 15 MiB (no plano Free o padrão é 50 MB).

## Publicar no GitHub Pages

1. Crie o repositório no GitHub e envie este código para a branch `main`.
2. Settings → Pages → *Source: GitHub Actions*.
3. Settings → Secrets and variables → Actions → aba **Variables**: crie
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (valores públicos).
4. O workflow `.github/workflows/deploy.yml` roda tipagem, testes, build com `BASE_PATH=/<repositório>/` e publica.
   O app fica em `https://<usuário>.github.io/<repositório>/`.
5. No Supabase, em Authentication → URL Configuration, coloque essa URL em *Site URL* (não é obrigatório para
   login com senha, mas evita links quebrados em e-mails do Auth).

Variáveis de build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `BASE_PATH` (subcaminho; padrão `/`).

## Instalar no celular

- **Android (Chrome):** abra a URL, entre na conta, menu ⋮ → **Instalar app** (ou *Adicionar à tela inicial*).
- **iPhone (Safari):** abra a URL, toque em **Compartilhar** → **Adicionar à Tela de Início** → *Adicionar*.

O atalho abre o histórico, com **Novo registro** no topo. No Android, pressionar o ícone também mostra
os atalhos *Novo registro* e *Comparar*.

## Como o envio funciona

1. Ao abrir o formulário o app reserva os IDs de experimento e etapa; cada foto escolhida recebe um ID próprio.
   O caminho é `<user_id>/<stage_id>/<photo_id>.<ext>` e não depende do ângulo, então trocar posições não exige reenvio.
2. As fotos vão direto do navegador ao Storage privado (2 em paralelo). Até 6 MB: upload comum; acima: upload
   retomável (TUS, blocos de 6 MB). Uploads já confirmados são reaproveitados em **Tentar novamente**.
3. `finalize_stage` (Postgres, `SECURITY INVOKER`, sujeita ao RLS) grava experimento + etapa + fotos numa transação,
   conferindo caminho, dono e existência de cada objeto. Repetir a chamada devolve o mesmo resultado.
   Se a resposta se perde, o app consulta o banco antes de declarar falha.
4. Toque repetido em **Salvar** é ignorado enquanto o envio corre; a restrição única `(stage_id, angle)` protege
   contra duplicatas mesmo com duas abas.
5. Se uma foto falhar, o formulário continua preenchido e oferece **Tentar novamente** e **Salvar só as fotos concluídas**.
6. Arquivos descartados são apagados só depois de confirmar no banco que não foram associados; a política do
   Storage também impede apagar uma foto publicada.

## Excluir uma etapa

- **No histórico:** deslize a linha da etapa para o lado (qualquer sentido) e toque em **Excluir**.
  Tocar na linha aberta só a fecha.
- **No detalhe da etapa:** botão **Excluir etapa**, no fim da tela.

Os dois pedem confirmação. A função `delete_stage` (Postgres, `SECURITY INVOKER`) apaga a etapa e as fotos numa
transação. Se era a última etapa do produto, o experimento também sai. Em seguida o app apaga os arquivos do Storage:
sem a linha em `photos`, a política de exclusão libera o objeto para o dono. Não tem como desfazer.

### Arquivos órfãos (aba fechada durante o envio)

Se a aba fechar entre o upload e a finalização (ou a rede cair logo depois de excluir uma etapa), o arquivo fica no bucket sem registro. Para listar e remover
(considera só objetos com mais de 24 h):

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> node scripts/clean-orphans.mjs           # lista
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> node scripts/clean-orphans.mjs --apagar  # remove
```

## Formatos e limites

| Item | Valor | Onde é validado |
| --- | --- | --- |
| Fotos por etapa | 1 a 4 | Interface e função `finalize_stage` |
| Formatos | JPEG, PNG, WebP | Interface (tipo + decodificação real), bucket (`allowed_mime_types`) e tabela |
| Tamanho | até 15 MiB por foto | Interface, bucket (`file_size_limit`) e tabela |
| HEIC/HEIF | recusado com aviso no próprio espaço; dá para **Trocar** só esse arquivo | Interface |

O `accept` do seletor lista só JPEG/PNG/WebP. Com isso o iPhone costuma converter HEIC para JPEG na hora
de entregar o arquivo. **Testado:** Chrome desktop em viewport de celular (Pixel 7), com JPEG/PNG pequenos,
PNG de 8 MB (upload retomável), arquivo de 16 MB, GIF e HEIC (recusados por arquivo).
**Ainda falta testar em aparelho real:** o arquivo que o seletor do iPhone/Safari entrega e a instalação na tela inicial.

## Segurança e privacidade

- RLS ativo em `experiments`, `stages` e `photos`: cada usuário só lê/grava os próprios registros.
  `anon` não tem acesso. Em `stages`, só `notes` e `is_favorite` podem ser atualizados. Cada um só exclui o que é seu.
- Chaves estrangeiras compostas `(id, user_id)` garantem que a etapa e o experimento (e a foto e a etapa) tenham o mesmo dono.
- Storage privado; leitura, envio e exclusão só no prefixo `<auth.uid()>/`. Fotos aparecem por URLs assinadas de 10 min, guardadas só em memória e limpas ao sair.
- O service worker guarda só os arquivos estáticos do próprio app; Supabase, imagens privadas e URLs assinadas nunca passam por ele.
- O repositório usa apenas imagens sintéticas geradas nos testes.

## Estrutura

```
src/lib/        domínio, regras puras (slots, compare, files), Supabase, upload, API, roteador, estado
src/screens/    Login, History, StageForm (novo/adicionar/completar), StageDetail, Compare
supabase/       config.toml local e migrações versionadas
tests/          integration (backend real) e e2e (Playwright)
scripts/        geração de ícones e limpeza de órfãos
```

## Próximas fases (fora do MVP)

WhatsApp/Evolution API, análise com IA, relatório PDF, filtros e catálogo de produtos, envio offline/em segundo
plano e miniaturas otimizadas (hoje o histórico carrega a foto original de capa de cada etapa).
