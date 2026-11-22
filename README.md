# Projeto Capilar

Diário fotográfico capilar pessoal, em português, pensado para o celular. Cada **finalização** é um
dia de lavagem com um produto, fotografado em três **momentos**: **Molhado**, **Seco** e
**Dia seguinte**, com até quatro ângulos (**Frente**, **Esquerdo**, **Direito**, **Costas**). O
comparador põe dois momentos iguais lado a lado no mesmo ângulo.

Estrutura: produto (experimento) → finalização → momento (etapa) → fotos. Cada finalização tem no
máximo um momento de cada tipo; refazer a finalização (lavar de novo) é uma finalização nova.

O histórico mostra um produto por linha (nome, marca, datas e foto da embalagem); tocar abre as
finalizações, cada uma com os três momentos lado a lado. Na finalização mais recente do produto, nos
primeiros 3 dias, o que falta aparece como atalho (**+ Seco**, **+ Dia seguinte**): abre direto as
fotos, sem perguntar produto de novo. O mais recente começa aberto, e a busca por produto ou marca
aparece a partir de 6 produtos.

**Produto primeiro.** O botão de cima é **+ Novo produto**: nome, marca e (opcional) foto da embalagem,
sem foto de cabelo. Ao cadastrar, o app pergunta se você quer registrar a primeira finalização agora
(**Registrar finalização** ou **Depois**). Produto sem finalização fica na lista com "Nenhuma finalização
ainda" e o convite para registrar. Não dá para cadastrar dois produtos com o mesmo nome e marca.

**Catálogo.** O **+ Novo produto** abre numa busca no catálogo de produtos de cabelo (milhares de itens
com foto padronizada: retrato 3:4, fundo branco, mesma margem). A busca aceita nome ou marca, sem acento e
com erro de digitação ("todecaxo" acha "Todecacho"); os atalhos mostram as marcas com mais produtos e o filtro
**Masculino** traz pomadas, ceras, shampoos e marcas masculinas. Tocou no produto, o formulário vem com nome,
marca e foto prontos. O que já está no seu histórico aparece marcado. Se não achar: **Pela foto** (a IA,
abaixo) ou **Cadastrar à mão**. O produto do histórico guarda de qual item do catálogo veio, mas copia nome,
marca e foto: mudar o catálogo não mexe no histórico.

**Identificar pela foto.** No Novo produto, uma foto qualquer da embalagem basta. A IA (Claude Haiku 5.5, pela
função `identify-product`, sem busca na web) só lê marca e nome no rótulo; a foto vem do catálogo do app e,
se o produto não estiver lá, da busca pública das lojas (até 3 fotos, padronizadas: retrato 3:4, fundo
branco). Custa frações de centavo por foto (o log da função registra os tokens de cada chamada). A foto
tirada só serve para identificar e não é guardada. Limite de 20 identificações por pessoa por dia.

**Nova finalização** fica dentro do produto (o **+**) e é uma tela só: momento (já marcado em Molhado),
data, fotos e observação, com um único botão fixo no rodapé. **Sem finalizador** está sempre na lista,
mesmo antes da primeira finalização sem produto.

O lápis do produto abre **Editar produto** (nome, marca e foto da embalagem, valendo para todas as
finalizações). No detalhe do momento, o lápis liga a edição das fotos: trocar, pôr no ângulo vazio ou
remover (a última não sai).

No comparador você escolhe o momento primeiro e só compara iguais: Molhado com Molhado, Seco com Seco,
Dia seguinte com Dia seguinte. Cada lista esconde o que está do outro lado, e só os ângulos que os dois
registros têm ficam clicáveis.

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
2. **Aplicar as migrações** (tabelas, restrições, RLS, bucket, políticas do Storage e as funções `finalize_stage`, `delete_stage` e `set_experiment_photo`):
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
6. **Identificar pela foto (opcional):** crie uma chave em https://platform.claude.com (com créditos) e
   guarde-a como segredo das Edge Functions: Dashboard → Edge Functions → Secrets → `ANTHROPIC_API_KEY`
   (ou `npx supabase secrets set ANTHROPIC_API_KEY=...`). Publique a função com
   `npx supabase functions deploy identify-product`. Opcional: `IDENTIFY_MODEL` (padrão `claude-haiku-5-5`).
   A chave fica só no Supabase; nunca vai para o app, o build ou o repositório.
7. **Limite de upload:** o bucket `capilar-photos` aceita JPEG/PNG/WebP até 15 MiB. Confira em
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

O atalho abre o histórico, com **Nova finalização** no topo. No Android, pressionar o ícone também mostra
os atalhos *Nova finalização* e *Comparar*.

## Como o envio funciona

1. Ao abrir o formulário o app reserva os IDs de experimento e etapa; cada foto escolhida recebe um ID próprio.
   O caminho é `<user_id>/<stage_id>/<photo_id>.<ext>` e não depende do ângulo, então trocar posições não exige reenvio.
2. Antes de enviar, o próprio aparelho prepara cada foto (`src/lib/images.ts`): se passa de 2048 px no lado maior
   ou de 2,5 MB, vira um JPEG de até 2048 px (foto de câmera de 3 a 5 MB fica com ~0,5 MB); foto já leve sobe como
   está. Também gera a miniatura `<foto>_t.jpg` (720 px, ~40 KB), usada no histórico, onde a foto aparece pequena.
   O enquadramento é guardado em frações da imagem, então vale para os dois tamanhos.
3. As fotos vão direto do navegador ao Storage privado (2 em paralelo). Até 6 MB: upload comum; acima: upload
   retomável (TUS, blocos de 6 MB, biblioteca baixada só quando precisa). Uploads já confirmados são reaproveitados
   em **Tentar novamente**. Se só a miniatura falhar, a foto é salva e a lista mostra a foto no lugar.
4. `finalize_stage` (Postgres, `SECURITY INVOKER`, sujeita ao RLS) grava experimento + etapa + fotos numa transação,
   conferindo caminho, dono e existência de cada objeto. Repetir a chamada devolve o mesmo resultado.
   Se a resposta se perde, o app consulta o banco antes de declarar falha.
5. Toque repetido em **Salvar** é ignorado enquanto o envio corre; a restrição única `(stage_id, angle)` protege
   contra duplicatas mesmo com duas abas.
6. Se uma foto falhar, o formulário continua preenchido e oferece **Tentar novamente** e **Salvar só as fotos concluídas**.
7. Arquivos descartados são apagados só depois de confirmar no banco que não foram associados; a política do
   Storage também impede apagar uma foto publicada.

## Enviar em PDF

No detalhe do momento e no comparador há o ícone **Enviar PDF**. Ele monta, no próprio aparelho, um PDF com as
fotos (com o enquadramento do app): o momento em grade, com a observação, ou o comparativo A × B lado a lado, um
ângulo por linha. A **finalização inteira** (ícone de PDF junto das ações do produto no histórico, onde se escolhe qual finalização, ou a opção "Finalização inteira"
no detalhe do momento) vira uma página com uma coluna por momento (molhado → seco → dia seguinte), um ângulo por
linha, e as observações no fim. A mensagem já vem pronta (dá para editar) e **Enviar** abre o compartilhamento do aparelho
(WhatsApp, e-mail…). Onde não há compartilhamento de arquivos (computador), o PDF é baixado e a mensagem copiada.

## Avisos

Confirmações ("Seco salvo.", "Momento excluído.", "Produto atualizado.", "Foto trocada.") e erros de ações
rápidas aparecem como avisos flutuantes embaixo da tela (acima do botão fixo, quando houver): verde com ✓,
vermelho com ! e neutro com i. Somem sozinhos (4 s; erros 7 s), fecham com um toque e o tempo pausa com o
dedo, o mouse ou o foco em cima. Leitores de tela anunciam (status para sucesso, alert para erro). Validação
de formulário e falhas que pedem ação (como reenviar fotos) continuam no lugar, perto do botão.

## Excluir um momento ou um produto

- **Momento:** no detalhe, ícone de lixeira no cabeçalho (**Excluir momento**).
- **Produto inteiro:** no histórico, com o produto aberto, ícone de lixeira à direita.

Os dois pedem confirmação. A função `delete_stage` (Postgres, `SECURITY INVOKER`) apaga o momento e as fotos numa
transação. Se era o último momento da finalização, a finalização sai. O produto fica (mesmo sem nenhuma
finalização); ele só sai pela lixeira do produto. Em seguida o app apaga os arquivos do Storage:
sem a linha em `photos`, a política de exclusão libera o objeto para o dono. Não tem como desfazer.

### Arquivos órfãos (aba fechada durante o envio)

Fotos de produto ficam em `<user_id>/produto-<experiment_id>/<foto>.<ext>`; a que está em uso não pode ser apagada.

Se a aba fechar entre o upload e a finalização (ou a rede cair logo depois de excluir uma etapa), o arquivo fica no bucket sem registro. Para listar e remover
(considera só objetos com mais de 24 h; a miniatura de uma foto em uso conta como em uso):

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> node scripts/clean-orphans.mjs           # lista
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> node scripts/clean-orphans.mjs --apagar  # remove
```

### Miniaturas de fotos antigas

Fotos enviadas antes das miniaturas ganham a sua com `scripts/make-thumbs.mjs` (as fotos passam só pela memória):

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> node scripts/make-thumbs.mjs           # lista o que falta
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> node scripts/make-thumbs.mjs --gravar  # gera e envia
```

## Catálogo de produtos (como é montado)

Os dados vêm do catálogo público (API de busca VTEX) de lojas que permitem acesso automático no robots.txt
(Época Cosméticos, Drogaria São Paulo, Pague Menos), só nos departamentos de cabelo, com poucas requisições
por vez. Os scripts ficam em `scripts/catalog/`:

| Passo | Script | O que faz |
| --- | --- | --- |
| 1 | `vtex-harvest.mjs <loja> <categorias> <saida.jsonl>` | Coleta (divide por subcategoria e marca para passar do limite de 2.500 por consulta) |
| 2 | `topsellers.mjs <loja> <categorias> <ranks.json>` | Posição de mais vendidos (ordena a busca) |
| 3 | `RANKS=... build.mjs <catalogo.json> <coletas...>` | Filtra (sem kits, coloração, alisamento, acessórios, rosto/corpo/barba), classifica o tipo, marca o público, tira marca e tamanho do nome e junta o mesmo produto de lojas diferentes |
| 4 | `photos.mjs <catalogo.json> <pasta>` | Foto padronizada (WebP 480x640) com `sharp` |
| 5 | `SUPABASE_URL=... SUPABASE_SECRET_KEY=... upload.mjs <catalogo.json> <pasta>` | Sobe fotos e linhas; apaga o que saiu do catálogo |

As regras de limpeza estão em `normalize.mjs` (com testes). As fotos são da vitrine das lojas e das marcas:
servem para uso pessoal e em teste; antes de abrir o app ao público, troque por fotos com licença aberta
(como as do Open Beauty Facts), enviadas pelos usuários ou autorizadas pelas marcas.

## Formatos e limites

| Item | Valor | Onde é validado |
| --- | --- | --- |
| Fotos por etapa | 1 a 4 | Interface e função `finalize_stage` |
| Formatos | JPEG, PNG, WebP | Interface (tipo + decodificação real), bucket (`allowed_mime_types`) e tabela |
| Tamanho | até 15 MiB por foto | Interface, bucket (`file_size_limit`) e tabela |
| HEIC/HEIF | recusado com aviso no próprio espaço; dá para **Trocar** só esse arquivo | Interface |

O `accept` do seletor lista só JPEG/PNG/WebP. Com isso o iPhone costuma converter HEIC para JPEG na hora
de entregar o arquivo. **Testado:** Chrome desktop em viewport de celular (Pixel 7), com JPEG/PNG pequenos,
PNG de 8 MB (reduzido no aparelho antes do envio), arquivo de 16 MB, GIF e HEIC (recusados por arquivo).
**Ainda falta testar em aparelho real:** o arquivo que o seletor do iPhone/Safari entrega e a instalação na tela inicial.

## Segurança e privacidade

- RLS ativo em `experiments`, `stages` e `photos`: cada usuário só lê/grava os próprios registros.
  `anon` não tem acesso. Em `stages`, só `notes` e `is_favorite` podem ser atualizados. Cada um só exclui o que é seu.
- Chaves estrangeiras compostas `(id, user_id)` garantem que a etapa e o experimento (e a foto e a etapa) tenham o mesmo dono.
- Storage privado; leitura, envio e exclusão só no prefixo `<auth.uid()>/`. Fotos aparecem por URLs assinadas de 1 h. Elas ficam guardadas no aparelho
  enquanto valem, para reabrir o app sem baixar as fotos de novo (o navegador reaproveita a cópia), e são apagadas ao sair.
- O último histórico (nomes de produto, datas, observações e caminhos das fotos, sem as fotos) fica guardado no
  aparelho por conta, para o app abrir na hora; é atualizado por trás e apagado ao sair da conta.
- O service worker guarda só os arquivos estáticos do próprio app (incluindo o motor e os modelos do enquadramento
  automático); Supabase, imagens privadas e URLs assinadas nunca passam por ele.
- O repositório usa apenas imagens sintéticas geradas nos testes.
- Identificar pela foto: a função confere a sessão (pelo RPC `consume_identify_quota`, que também conta o
  limite diário e não tem tabela acessível pela API), só abre endereços https públicos (sem IP, localhost ou
  nomes internos, conferindo cada redirecionamento) e limita tempo e tamanho de páginas e imagens. A foto da
  embalagem vai para a API da Anthropic só para a identificação.

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
