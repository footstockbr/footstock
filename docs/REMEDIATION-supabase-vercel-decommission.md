# Remediação: baixa de Supabase + Vercel (foot-stock)

> Status: plano em execução. Contexto: os projetos Supabase e Vercel foram desativados. O DB de produção já roda em Railway-internal Postgres via Prisma. Auth está em migração de Supabase Auth para Auth.js, NextAuth v5. Este documento lista blockers de runtime, contrapontos fortes e uma ordem de correção defensável antes da Parte 2, que toca a cadeia de auth e pode quebrar produção silenciosamente.

## Convenções operacionais

Execute todos os comandos a partir da raiz do app Next.js, aqui referida como `<workspace_root>`.

```bash
cd <workspace_root>
```

Quando este documento usar `npm run ...`, leia como `hipotese H-PM: o projeto usa npm e possui scripts equivalentes`. Decisão pendente: confirmar o package manager e os scripts reais em `package.json`.

Comando de confirmação:

```bash
test -f pnpm-lock.yaml && echo pnpm || test -f yarn.lock && echo yarn || test -f package-lock.json && echo npm || echo "package-manager-indefinido"
node -e "const p=require('./package.json'); console.log(p.scripts || {})"
```

Critério de sucesso global para qualquer etapa:

- O comando executado termina com exit code `0`.
- Nenhuma credencial, token, cookie, hash de senha ou connection string aparece nos logs.
- Alterações ficam em commits pequenos e reversíveis.
- Qualquer decisão baseada em dado ausente fica marcada como `hipotese` até validação.

Critério de falha global:

- Build quebra por env ausente sem mensagem explícita.
- Login, logout, sessão após refresh, rota protegida ou API autenticada deixam de funcionar sem erro visível.
- Qualquer código aceita autenticação por caminho legado sem log seguro e sem teste de caracterização.
- Qualquer segredo real aparece em arquivo versionado, log, teste ou fixture.

## Tese revisada

Com Supabase e Vercel desligados, qualquer chamada a `*.supabase.co`, pooler Supabase ou URLs Vercel antigas tende a falhar em runtime. O conserto não é apenas "remover Supabase": é garantir que identidade, sessão, autorização, reset de senha, deleção de conta, notificações e automações continuem tendo uma fonte de verdade coerente.

A estratégia segura é:

1. Consolidar config em Railway e remover credenciais mortas sem quebrar build, CI, migrations e runtime.
2. Auditar todos os pontos onde Supabase ainda participa de auth, sessão, user lookup, admin actions e realtime.
3. Migrar auth com compatibilidade temporária ou corte controlado, não com remoção cega.
4. Só depois tornar envs Supabase opcionais e remover fallbacks.
5. Tratar realtime/polling como decisão de produto e infraestrutura, com critérios de latência, custo e degradação.

Critério de sucesso da tese: ao final, produção não depende de Supabase nem Vercel para autenticação, autorização, DB, reset de senha, deleção de conta, notificações ou automações críticas.

Critério de falha da tese: restar qualquer chamada runtime a Supabase ou URL Vercel antiga fora de código morto comprovado ou fora de módulo legado explicitamente bloqueado.

## Fonte da verdade da migração de DB

Fonte de verdade atual declarada: produção usa Railway-internal Postgres via Prisma.

Config esperada:

- `DATABASE_URL`: URL interna do Postgres Railway usada pela aplicação em runtime dentro da rede Railway.
- `DIRECT_URL`: URL pública/proxy ou canal próprio para operações de migration quando necessário.
- Prisma deve usar `DATABASE_URL` para runtime e `DIRECT_URL` apenas se o schema exigir conexão direta para migrations.

hipotese H-DB-1: o schema Prisma já está configurado com `directUrl = env("DIRECT_URL")`. Decisão pendente: validar no `schema.prisma`.

Comandos de validação:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*lock*' 'DATABASE_URL|DIRECT_URL|directUrl|provider = "postgresql"' .
npx prisma validate
npx prisma migrate status
```

Condição de entrada:

- Railway possui `DATABASE_URL` válido para runtime.
- `DIRECT_URL` existe quando `schema.prisma` ou o fluxo de migration exige.
- Nenhum valor Supabase pooler é usado por `DATABASE_URL` ou `DIRECT_URL`.

Condição de saída:

- `npx prisma validate` passa.
- `npx prisma migrate status` não tenta conectar em Supabase.
- Logs de startup não citam host `supabase.co`, pooler Supabase ou domínio Vercel antigo.

Critério de falha:

- `prisma migrate status` aponta para host Supabase.
- `DATABASE_URL` contém `supabase`, `pooler.supabase`, `vercel`, ou credencial placeholder.
- Runtime depende de `DIRECT_URL`.

## Parte 1: CONFIG

### C1. `.env.deploy`

Objetivo: consolidar variáveis de produção Railway em um arquivo de deploy sem credenciais mortas.

Condição de entrada:

- A origem autorizada das variáveis Railway foi definida.
- O arquivo `.env.deploy` não será commitado se contiver segredos reais.
- Existe `.gitignore` cobrindo `.env`, `.env.*` sensíveis e dumps de env.

Comandos de auditoria:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' '^\.env|\.env\.deploy|env\.deploy|gitignore' .
git check-ignore .env .env.deploy .env.local .env.production 2>/dev/null || true
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'supabase\.co|pooler\.supabase|vercel\.app|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL|AUTH_SECRET|AUTH_URL|NEXTAUTH_URL' .
```

Requisitos:

- `.env.deploy` deve conter somente variáveis necessárias para Railway.
- Supabase não pode aparecer em `DATABASE_URL`, `DIRECT_URL`, auth, storage, realtime ou public URL.
- URLs Vercel antigas não podem aparecer como callback, base URL, redirect URL, CORS origin ou webhook URL.
- Se um segredo real for necessário em arquivo local, ele deve permanecer ignorado pelo git.

Critérios de aceite:

- `git check-ignore .env .env.deploy .env.local .env.production` confirma que arquivos sensíveis são ignorados ou o projeto documenta explicitamente quais envs são templates sem segredo.
- `rg -n 'supabase\.co|pooler\.supabase|vercel\.app' .env*` não retorna valor ativo em arquivo usado por deploy.
- `DATABASE_URL` aponta para Postgres Railway, não para Supabase.
- `AUTH_SECRET` existe em runtime de produção e não é placeholder.
- `AUTH_URL` ou `NEXTAUTH_URL` aponta para o domínio canônico atual, não para Vercel antigo.

Critério de falha:

- `.env.deploy` contém chave Supabase real, URL Vercel antiga ou placeholder que parece credencial real.
- O app sobe com fallback silencioso para env local ou default inseguro.

### C2. `.env`: neutralizar Supabase

Objetivo: impedir que variáveis Supabase antigas mantenham caminhos mortos aparentemente funcionais.

Condição de entrada:

- B0 inventário inicial foi executado ou esta etapa fica restrita a arquivo local, sem alteração de código.
- Sabe-se quais módulos ainda importam Supabase.

Requisitos:

- Variáveis Supabase não devem ser apagadas antes de identificar todos os pontos de uso.
- Variáveis Supabase podem ser deixadas vazias apenas depois que o código consumidor tiver guard explícito e erro compreensível.
- Não usar valores fictícios com formato real, como JWT falso, URL parecida com Supabase ou service role fake.

Comando de validação:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_JWT_SECRET' .
```

Critérios de aceite:

- Cada variável Supabase encontrada está classificada como `remover`, `temporaria`, `legado bloqueado` ou `teste`.
- Nenhum módulo crítico falha no import por env Supabase vazia.
- Quando Supabase estiver indisponível, o erro é explícito: `Supabase legacy path disabled` ou equivalente, sem expor env.
- Build local e build prod-like passam com envs Supabase vazias após B1 a B6.

Critério de falha:

- Remover env Supabase quebra build antes de B1 a B6.
- Código client recebe `NEXT_PUBLIC_SUPABASE_*` sem necessidade validada.
- Placeholder de credencial é mantido e pode ser confundido com valor real.

### C3. `env.ts`: `AUTH_DRIVER` default `authjs`

Objetivo: fazer Auth.js ser o caminho padrão sem esconder código Supabase ativo.

Condição de entrada:

- B1, B2 e B3 têm testes de caracterização.
- `AUTH_DRIVER` existe ou sua ausência foi confirmada.

Comandos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'AUTH_DRIVER|authjs|supabase' .
```

Requisitos:

- `AUTH_DRIVER` ausente deve resolver para `authjs` apenas se todos os fluxos críticos Auth.js estiverem validados.
- `AUTH_DRIVER=supabase` não deve ser aceito em produção.
- Em ambiente local, `AUTH_DRIVER=supabase` só pode existir se marcado como legado e protegido por erro claro.

Critérios de aceite:

- `AUTH_DRIVER` defaulta para `authjs` quando ausente.
- Produção falha no startup se `AUTH_DRIVER=supabase`.
- Teste ou script valida que `AUTH_DRIVER` inválido retorna erro de config antes do runtime.
- `rg -n 'AUTH_DRIVER.*supabase|supabase.*AUTH_DRIVER'` mostra apenas código legado bloqueado, teste ou documentação.

Critério de falha:

- Build aceita `AUTH_DRIVER=supabase` em produção.
- Código muda de driver sem log seguro.
- Um valor inválido cai em Supabase por default.

### C4. Playwright staging fallback `footstock.com.br`

Objetivo: garantir que E2E usa domínio atual e não Vercel antigo.

hipotese H-E2E-1: o projeto usa Playwright. Decisão pendente: confirmar `playwright.config.*` e scripts.

Comandos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'playwright|baseURL|footstock\.com\.br|vercel\.app|NEXT_PUBLIC_APP_URL|APP_URL|AUTH_URL|NEXTAUTH_URL' .
```

Requisitos:

- `baseURL` de staging deve vir de env explícita.
- Fallback pode apontar para `https://footstock.com.br` somente se esse for o domínio canônico atual.
- Vercel antigo não pode ser fallback.

Critérios de aceite:

- `playwright.config.*` não contém domínio Vercel antigo.
- Testes E2E falham cedo se `baseURL` estiver ausente e não houver fallback aprovado.
- `AUTH_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` e `baseURL` apontam para o mesmo domínio canônico por ambiente.
- Rodar smoke E2E contra staging valida login, logout e rota protegida.

Critério de falha:

- Playwright testa Vercel antigo.
- Teste passa contra ambiente errado.
- Callback Auth.js usa domínio diferente do domínio acessado pelo browser.

## Blockers de runtime

## B0. Inventário obrigatório antes de mexer em auth

Objetivo: produzir mapa verificável de dependências Supabase, Auth.js, Bearer token, envs antigas e URLs mortas antes de qualquer remoção.

Condição de entrada:

- Working tree conhecido.
- Branch ou commit isolado criado para remediação.
- Nenhuma alteração em auth feita antes deste inventário.

Comandos:

```bash
git status --short
git switch -c hardening/remove-supabase-vercel || git branch --show-current

rg -n --hidden \
  --glob '!node_modules' \
  --glob '!.next' \
  --glob '!dist' \
  --glob '!coverage' \
  --glob '!*.lock' \
  'supabase|createClient|auth\.getUser|signInWithPassword|admin\.signOut|admin\.deleteUser|onAuthStateChange|realtime|channel\(|broadcast|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE_KEY|AUTH_DRIVER|Bearer|Authorization|vercel\.app|pooler\.supabase|supabase\.co' .
```

Classificação obrigatória de cada ocorrência:

- `build-only`: usado apenas em validação de build ou schema.
- `dev-only`: usado apenas em dev local, com guard explícito.
- `runtime-server`: executa em server runtime.
- `runtime-client`: executa no browser.
- `test`: fixture, mock ou teste.
- `script-CI`: script de pipeline.
- `morto`: código inalcançável comprovado por import graph, rota removida ou feature flag permanentemente desligada.

Formato mínimo do inventário:

```md
| Arquivo | Linha | Padrão | Classificação | Dono da decisão | Ação | Critério de remoção |
|---|---:|---|---|---|---|---|
```

Testes de caracterização obrigatórios antes de alterar auth:

- Login válido.
- Login inválido.
- Logout.
- Sessão após refresh.
- Rota protegida `club`.
- Rota protegida `admin`.
- API com cookie Auth.js.
- API com token motor.
- Reset de senha.
- Deleção de conta.
- Notification bell.

hipotese H-TEST-1: existem ou serão criados testes Playwright/API para esses fluxos. Decisão pendente: confirmar framework de teste real.

Comandos sugeridos para localizar cobertura atual:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'login|logout|protected|admin|reset|delete account|deletion|notification|bell|motor-token|Bearer|auth\(\)|signIn' .
```

Rollback mínimo:

- Commit isolado para config Railway.
- Commit isolado para auth middleware.
- Commit isolado para login.
- Commit isolado para admin session.
- Feature flag ou branch deployável para voltar auth sem desfazer config Railway.
- Logs temporários de auth sem token, sem cookie, sem e-mail completo e sem user agent completo.
- Plano explícito para reverter apenas auth.

Logs permitidos:

```txt
auth_path=authjs_cookie route=/api/x result=accepted user_id_hash=... role=club
auth_path=motor_token route=/api/x result=accepted principal=motor
auth_path=none route=/public/x result=public
auth_path=legacy_supabase route=/api/x result=rejected reason=disabled
```

Logs proibidos:

- `Authorization` completo.
- Cookie completo.
- JWT.
- `AUTH_SECRET`.
- `DATABASE_URL`.
- Service role.
- Senha ou hash de senha.
- E-mail completo se não houver política de PII aprovada.

### Critérios de aceite

- O inventário contém todas as ocorrências retornadas pelo `rg` obrigatório ou justifica falso positivo por linha.
- Toda ocorrência tem classificação, ação e critério de remoção.
- Existe baseline de testes ou checklist manual executado para os 11 fluxos críticos.
- Existe branch/commit isolado para rollback.
- Logs temporários foram definidos com redaction antes de serem adicionados.
- Nenhum blocker B1 a B8 começa sem B0 concluído ou sem exceção explícita aprovada.

Critério de falha:

- Remoção começa sem inventário.
- Occorrência runtime fica classificada como `morto` sem prova.
- Testes de caracterização são substituídos por "build passou".
- Rollback exige desfazer DB config Railway.

## B1. `api/middleware.ts:194-201`: cortar branch Supabase Bearer

Objetivo: remover ou bloquear autenticação por Supabase Bearer e substituir por matriz explícita de autenticação por rota.

Ponto conhecido: `api/middleware.ts:194-201`.

hipotese H-B1-1: o arquivo e as linhas ainda existem nesse formato. Decisão pendente: validar com `nl -ba`.

Comandos:

```bash
nl -ba api/middleware.ts | sed -n '160,230p'
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'Bearer|Authorization|auth\.getUser|motor-token|motor token|auth\(\)|middleware' api . src 2>/dev/null
```

Matriz obrigatória por rota:

| Tipo de rota | Identidade aceita | Autorização | Falha esperada |
|---|---|---|---|
| Browser autenticado | Cookie Auth.js | Role no banco | `401` sem sessão, `403` sem role |
| M2M motor | `motor-token` ou assinatura equivalente | Escopo do token | `401` token ausente/inválido |
| Pública | Nenhuma ou assinatura pública aprovada | Não aplicável | Não deve ler sessão obrigatória |
| Admin | Cookie Auth.js | Role/admin no banco | `401` sem sessão, `403` não admin |

Requisitos:

- Bearer Supabase não pode autenticar usuário.
- Se `Authorization: Bearer ...` continuar aceito para M2M, ele deve ser validado como motor-token, não via Supabase.
- Toda rota protegida deve declarar o tipo de auth esperado.
- O log deve registrar tipo de auth aceito por rota, nunca o token.

Exemplo de log seguro:

```txt
auth_decision route=/api/admin/x expected=admin received=authjs_cookie result=accepted
auth_decision route=/api/motor/x expected=motor received=motor_token result=accepted
auth_decision route=/api/club/x expected=club received=bearer result=rejected reason=supabase_bearer_disabled
```

### Critérios de aceite

- `rg -n 'auth\.getUser|Supabase.*Bearer|Bearer.*Supabase|createClient' api/middleware.ts` não encontra autenticação Supabase ativa.
- Cada rota protegida no middleware está coberta pela matriz browser, M2M, pública ou admin.
- Requisição com cookie Auth.js válido acessa rota browser permitida.
- Requisição sem cookie para rota browser recebe `401`.
- Requisição com usuário comum em rota admin recebe `403`.
- Requisição M2M com motor-token válido acessa apenas rotas M2M.
- Requisição com Bearer Supabase legado recebe `401` ou `403`, não fallback silencioso.
- Logs mostram `auth_path` ou `auth_decision`, sem token.

Comandos de verificação, adaptando URLs ao ambiente:

```bash
curl -i "$APP_URL/api/health"
curl -i "$APP_URL/api/<rota-protegida>" 
curl -i -H "Authorization: Bearer invalid" "$APP_URL/api/<rota-m2m-ou-protegida>"
curl -i -H "Authorization: Bearer $MOTOR_TOKEN" "$APP_URL/api/<rota-m2m>"
```

Critério de falha:

- Bearer legado ainda cria sessão de usuário.
- Middleware aceita qualquer Bearer como usuário autenticado.
- Rota admin decide autorização só pela existência de sessão.
- Log imprime token, cookie ou e-mail completo.

## B2. `club/auth/login`: `signInWithPassword` para Auth.js Credentials

Objetivo: trocar login Supabase Auth por Auth.js Credentials sem quebrar usuários existentes nem criar ambiguidade sobre onde a senha vive.

Comandos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'club/auth/login|signInWithPassword|Credentials|authorize\(|bcrypt|argon2|password|hash|salt|signIn\(' .
```

Decisões obrigatórias antes da troca:

- Onde a senha vive hoje?
- Qual algoritmo de hash é usado?
- Existe campo de senha no banco Prisma?
- Usuários Supabase Auth têm senha migrada para o banco?
- Usuários sem senha migrada recebem qual experiência?
- Reset de senha atualiza qual fonte de verdade?

hipoteses pendentes:

- H-B2-1: as senhas compatíveis com Auth.js Credentials estão no banco acessível pelo Prisma.
- H-B2-2: o algoritmo de hash é conhecido e suportado pelo código atual.
- H-B2-3: usuários vindos do Supabase Auth podem existir sem senha migrada.

Enquanto H-B2-1 e H-B2-2 não forem confirmadas, não remover `signInWithPassword` sem plano de corte controlado.

Comportamento obrigatório:

- Usuário com senha válida autentica via Auth.js.
- Usuário com senha inválida recebe erro genérico, sem revelar existência da conta.
- Usuário sem senha migrada recebe fluxo explícito: reset de senha ou suporte, não erro técnico.
- Cookie Auth.js é emitido com config prod-like.
- `AUTH_SECRET` é obrigatório em produção.
- `AUTH_URL` ou `NEXTAUTH_URL` aponta para domínio canônico.
- `trustHost` deve estar configurado conforme necessidade do ambiente Railway/Auth.js. hipotese H-B2-4: Railway precisa de `trustHost` ou equivalente por proxy. Decisão pendente: validar comportamento real.

Comandos prod-like:

```bash
AUTH_SECRET="$(openssl rand -base64 32)" \
AUTH_URL="https://<dominio-canonico>" \
NEXTAUTH_URL="https://<dominio-canonico>" \
npm run build
```

### Critérios de aceite

- `rg -n 'signInWithPassword' .` não retorna uso runtime em login.
- Auth.js Credentials valida senha contra fonte canônica definida.
- Login válido retorna sessão e cookie Auth.js.
- Login inválido não informa se e-mail existe.
- Usuário sem senha migrada recebe mensagem clara e ação possível, como reset de senha, se a política permitir.
- Refresh da página preserva sessão.
- Logout remove cookie e invalida sessão do browser.
- Produção ou ambiente prod-like não inicia sem `AUTH_SECRET`.
- `AUTH_URL` ou `NEXTAUTH_URL` não aponta para Vercel antigo.

Critério de falha:

- Login depende de Supabase Auth.
- Usuário sem senha migrada fica preso em erro genérico.
- Cookie Auth.js funciona localmente, mas falha em ambiente com proxy por URL/host incorreto.
- Senha é comparada em texto puro ou logada.

## B3. `AdminSessionService`: `auth.getUser` e `admin.signOut` para Auth.js `auth()`

Objetivo: separar autenticação de autorização em admin e remover dependência de Supabase para sessão/logout.

Comandos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'AdminSessionService|auth\.getUser|admin\.signOut|auth\(\)|role|admin|isAdmin|signOut' .
```

Requisitos:

- Autenticação: Auth.js `auth()` ou mecanismo equivalente da versão instalada.
- Autorização: role/admin lida da fonte canônica do banco.
- Não aceitar role vinda apenas do client, JWT não verificado ou metadata Supabase.
- Logout deve limpar cookie Auth.js.
- Sessão expirada deve falhar como `401`.
- Sessão válida sem role admin deve falhar como `403`.

hipotese H-B3-1: a role admin existe em tabela Prisma ou campo de usuário. Decisão pendente: localizar schema e regra atual.

Matriz de teste:

| Caso | Resultado esperado |
|---|---|
| Admin válido | acesso permitido |
| Usuário comum | `403` |
| Sem sessão | `401` |
| Sessão expirada | `401` |
| Cookie antigo Supabase | `401` |
| Cookie Auth.js corrompido | `401` |
| Admin removido no banco após login | `403` no próximo acesso sensível |

### Critérios de aceite

- `rg -n 'auth\.getUser|admin\.signOut' .` não retorna uso runtime em admin.
- AdminSessionService usa Auth.js para autenticação.
- Role/admin é consultada no banco ou fonte canônica definida, não em dado client.
- Logout limpa cookie Auth.js e redireciona para estado deslogado.
- Todos os casos da matriz foram testados manualmente ou automatizados.
- Logs indicam `admin_auth result=accepted|rejected reason=...` sem PII sensível.

Critério de falha:

- Role admin vem de claim Supabase legado.
- Usuário comum autenticado acessa admin.
- Logout chama Supabase ou só limpa estado client.
- Cookie antigo é aceito por compatibilidade acidental.

## B4. Fallbacks Supabase em `club-auth`, `affiliate-auth`, `server.ts`, `auth.ts`

Objetivo: instrumentar antes de remover fallbacks para evitar cortar caminho ainda usado em produção.

Comandos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'club-auth|affiliate-auth|server\.ts|auth\.ts|fallback|supabase|createClient|auth\.getUser|onAuthStateChange' .
```

Requisitos:

- Todo fallback Supabase deve emitir métrica/log seguro quando acionado.
- Medir acionamento antes de remover, por janela mínima definida.
- Se acionamento for `0`, substituir por erro explícito recuperável.
- Se acionamento for maior que `0`, bloquear remoção e abrir decisão de produto/técnica.

hipotese H-B4-1: existe observabilidade disponível para contar acionamentos. Decisão pendente: definir se será log Railway, APM, banco de auditoria ou métrica simples.

Log mínimo:

```txt
legacy_auth_fallback component=club-auth result=triggered user_id_hash=... route=/...
legacy_auth_fallback component=affiliate-auth result=blocked reason=supabase_disabled
```

Janela mínima recomendada:

- Staging: exercitar todos os fluxos críticos.
- Produção: pelo menos 24 horas de tráfego real antes de remover, se já estiver em uso. hipotese H-B4-2: há tráfego suficiente para validar em 24 horas.

### Critérios de aceite

- Cada fallback Supabase tem log/métrica segura antes da remoção.
- Existe contagem por componente e rota.
- Fallback com acionamento `0` em janela aprovada foi trocado por erro explícito recuperável.
- Fallback com acionamento maior que `0` permanece bloqueado até decisão documentada.
- Erro recuperável orienta ação: relogar, resetar senha, contatar suporte ou tentar novamente, conforme fluxo.

Critério de falha:

- Fallback é removido sem saber se era usado.
- Fallback dispara e falha silenciosamente.
- Métrica não permite identificar componente ou rota.
- Mensagem ao usuário expõe detalhe interno de auth.

## B5. `account-deletion`: `supabaseAdmin.auth.admin.deleteUser`

Objetivo: substituir deleção Supabase Auth por política explícita de deleção no banco ou desabilitar a ação até a política existir.

Comandos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'account-deletion|deleteUser|admin\.deleteUser|delete account|deletar conta|anonimi|PII|session|credential' .
```

Decisões obrigatórias:

- Deleção será soft delete ou hard delete?
- PII será removida, anonimizada ou retida por obrigação legal?
- Sessões Auth.js serão revogadas?
- Credenciais de login serão removidas?
- Dados relacionais serão apagados, anonimizados ou preservados?
- O usuário recebe qual mensagem final?
- Auditoria registra o que, por quanto tempo e sem qual PII?
- Existe janela de arrependimento ou reversão?

hipotese H-B5-1: não há política formal de retenção/anonimização no texto atual. Decisão pendente: aprovar política antes de manter botão ativo.

Regra segura:

- Se a política não estiver definida, desabilitar a ação de deleção com mensagem clara.
- Não simular deleção apagando apenas Supabase Auth.
- Não apagar usuário no banco sem tratar relações e sessões.

Mensagem mínima quando desabilitado:

```txt
A exclusão de conta está temporariamente indisponível enquanto finalizamos a migração de autenticação. Entre em contato com o suporte para solicitar remoção manual.
```

### Critérios de aceite

- `rg -n 'admin\.deleteUser|deleteUser' .` não retorna deleção Supabase ativa.
- Existe política definida para soft/hard delete, PII, sessões, credenciais, dados relacionais, mensagem e auditoria.
- Se a política não existir, a ação está desabilitada no frontend e no backend.
- Backend bloqueia deleção mesmo que o usuário chame a API diretamente quando a política estiver pendente.
- Tentativa de deleção retorna status e mensagem consistentes.
- A operação é auditável sem expor PII excessiva.

Critério de falha:

- Botão de deletar conta parece funcionar, mas só remove Supabase Auth.
- Frontend esconde botão, mas API continua ativa.
- Dados relacionais ficam órfãos.
- Sessão continua válida após deleção efetiva.

## B6. `NotificationBell`, `inbox-page`, `push-sync-bootstrap`: `userId` via Auth.js

Objetivo: substituir `getUser()` por sessão Auth.js e resolver identidade canônica para notificações.

Comandos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'NotificationBell|inbox-page|push-sync-bootstrap|getUser\(|userId|notification|inbox|push' .
```

Decisões obrigatórias:

- Qual é o ID canônico do usuário no banco?
- O ID Auth.js corresponde ao ID legado Supabase?
- Existe tabela de mapeamento legado `<->` Auth.js?
- Notificações antigas usam qual chave?
- O que acontece se existe sessão, mas `userId` não resolve?

hipoteses pendentes:

- H-B6-1: `session.user.id` é o ID canônico usado nas tabelas de notificação.
- H-B6-2: IDs Supabase legados podem existir em notificações antigas.
- H-B6-3: existe forma determinística de mapear legado para usuário Prisma.

Requisitos:

- `NotificationBell` não deve chamar Supabase no client.
- Inbox deve buscar notificações por ID canônico validado no server.
- Se sessão existe mas `userId` não resolve, mostrar erro recuperável e registrar log seguro.
- Não retornar notificações de outro usuário em fallback.
- Push sync deve abortar sem sessão válida.

Estado de erro obrigatório:

```txt
Não foi possível carregar suas notificações porque sua sessão precisa ser atualizada. Faça login novamente.
```

### Critérios de aceite

- `rg -n 'getUser\(|auth\.getUser|supabase'` nos componentes de notificação não encontra uso runtime.
- Sessão Auth.js resolve `userId` canônico no server.
- Usuário sem sessão não dispara polling ou push sync.
- Sessão válida com `userId` não resolvido mostra erro claro e não vaza dados.
- Notificações antigas continuam acessíveis apenas se o mapeamento legado foi validado.
- Teste cobre usuário A não recebendo notificações do usuário B.
- Notification bell trata loading, empty, error e retry.

Critério de falha:

- Client confia em `userId` vindo do browser.
- Fallback usa e-mail para buscar notificações sem normalização e unicidade garantidas.
- Sessão inválida fica em loop de requests.
- Notificação aparece para usuário errado.

## B7. `env.ts`: tornar Supabase vars opcionais e remover do `buildFallback`

Objetivo: remover Supabase como requisito de build somente depois que B1 a B6 estiverem fechados.

Condição de entrada obrigatória:

- B1 aprovado.
- B2 aprovado.
- B3 aprovado.
- B4 aprovado.
- B5 aprovado ou ação desabilitada.
- B6 aprovado.

Comandos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'env\.ts|buildFallback|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE' .
```

Requisitos:

- Supabase vars opcionais não podem mascarar caminho runtime ativo.
- Remover Supabase do `buildFallback`.
- Módulos legados devem ter guard explícito e erro claro.
- Build deve passar com envs Supabase vazias.
- Não manter placeholders que pareçam credenciais reais.

Teste prod-like sem Supabase:

```bash
env -u NEXT_PUBLIC_SUPABASE_URL \
    -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
    -u SUPABASE_SERVICE_ROLE_KEY \
    -u SUPABASE_URL \
    -u SUPABASE_ANON_KEY \
    npm run build
```

hipotese H-B7-1: o shell e o package manager aceitam o formato acima. Se não, usar mecanismo equivalente do ambiente CI.

### Critérios de aceite

- Build passa com todas as envs Supabase removidas.
- Testes críticos passam com envs Supabase removidas.
- `env.ts` não exige Supabase para produção.
- `buildFallback` não contém Supabase.
- Código legado que ainda importa Supabase falha com erro explícito se executado.
- `rg -n 'supabase\.co|pooler\.supabase|SUPABASE_SERVICE_ROLE_KEY' .` não encontra valor ativo fora de docs/templates/testes marcados.

Critério de falha:

- Build só passa com env Supabase placeholder.
- Variável pública Supabase continua sendo exposta ao client.
- Erro de env aparece somente em runtime de usuário final.
- Guard legado permite chamada real para Supabase desligado.

## B8. Realtime notificações: polling 30s e remoção de broadcast Supabase

Objetivo: remover realtime/broadcast Supabase e adotar polling controlado como solução intermediária, com SSE como follow-up deliberado.

Comandos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'realtime|channel\(|broadcast|NotificationBell|poll|setInterval|AbortController|visibilityState|SSE|EventSource' .
```

Decisão de produto e infraestrutura:

- Polling 30s é aceitável para notificações não críticas.
- SSE fica como follow-up se volume, latência ou experiência exigirem.
- Não implementar SSE sem critério de necessidade, dono e teste de conexão.

Requisitos para polling:

- Intervalo padrão: 30s em aba ativa.
- Aba oculta: intervalo maior ou pausa. Sugestão verificável: 120s ou pausa total, pendente de decisão.
- Sem sessão: polling pausado.
- Erro de rede: backoff progressivo com limite.
- Requests concorrentes: abortar anterior com `AbortController` ou impedir overlap.
- Cache/dedupe: não duplicar notificações já exibidas.
- Estado visível: loading inicial, empty, erro recuperável, retry.
- Custo: endpoint deve limitar page size e consultar por índice adequado. hipotese H-B8-1: há índice por `userId` e data/status nas notificações. Decisão pendente: validar schema.

Critérios de latência e custo:

- Latência máxima aceitável para nova notificação em aba ativa: até 35s.
- Em aba oculta: até 2 minutos ou entrega somente ao retornar, conforme decisão de produto.
- Endpoint deve responder em tempo previsível. Meta inicial: p95 menor que 500ms em staging com volume representativo. hipotese H-B8-2: staging possui volume representativo.
- Volume máximo inicial precisa ser definido antes de produção. hipotese H-B8-3: volume de usuários simultâneos ainda não está informado.

### Critérios de aceite

- `rg -n 'channel\(|broadcast|realtime' .` não retorna uso runtime Supabase para notificações.
- Polling inicia apenas com sessão válida e `userId` resolvido.
- Polling para no logout.
- Aba oculta reduz frequência ou pausa.
- Erros usam backoff e mostram estado recuperável após falhas consecutivas.
- Não há requests sobrepostos.
- Notificações duplicadas não aparecem após refresh ou polling repetido.
- Endpoint limita quantidade retornada e filtra por usuário autenticado no server.
- Existe decisão registrada para SSE: `não agora`, `follow-up`, ou `obrigatório antes de produção`.

Critério de falha:

- Broadcast Supabase continua ativo.
- Polling roda sem sessão.
- Polling continua após logout.
- Erro de rede gera loop agressivo.
- Endpoint aceita `userId` arbitrário do client.

## Ordem de execução revisada

### 1. Congelar estado e abrir branch

Comandos:

```bash
git status --short
git switch -c hardening/remove-supabase-vercel || true
git branch --show-current
```

Sucesso:

- Branch de trabalho identificada.
- Alterações pré-existentes estão conhecidas.
- Nada foi revertido sem decisão explícita.

Falha:

- Working tree tem mudanças não entendidas em arquivos de auth/config.
- Não há como separar rollback.

### 2. Executar inventário B0

Comando principal:

```bash
rg -n --hidden --glob '!node_modules' --glob '!.next' --glob '!dist' --glob '!coverage' --glob '!*.lock' 'supabase|createClient|auth\.getUser|signInWithPassword|admin\.signOut|admin\.deleteUser|onAuthStateChange|realtime|channel\(|broadcast|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE_KEY|AUTH_DRIVER|Bearer|Authorization|vercel\.app|pooler\.supabase|supabase\.co' .
```

Sucesso:

- Inventário preenchido.
- Cada ocorrência classificada.
- Riscos de runtime destacados.

Falha:

- Ocorrências sem classificação.
- Supabase em runtime tratado como "provavelmente morto".

### 3. Validar DB Railway e Prisma

Comandos:

```bash
npx prisma validate
npx prisma migrate status
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'DATABASE_URL|DIRECT_URL|supabase|pooler' prisma .env* 2>/dev/null
```

Sucesso:

- Prisma valida.
- Migration status consulta DB esperado.
- URLs Supabase não aparecem em DB runtime/migration.

Falha:

- Migrations apontam para Supabase.
- Runtime depende de `DIRECT_URL`.
- Env de produção não está definida.

### 4. Corrigir config Railway e domínios

Escopo:

- `.env.deploy`.
- `.env`.
- Railway variables.
- `AUTH_URL` ou `NEXTAUTH_URL`.
- `NEXT_PUBLIC_APP_URL`.
- Playwright `baseURL`.

Sucesso:

- URLs Vercel antigas removidas de runtime.
- Domínio canônico consistente.
- Secrets não versionados.

Falha:

- Callback Auth.js usa domínio diferente do app.
- Build usa Vercel antigo como fallback.

### 5. Criar ou registrar testes de caracterização

Fluxos mínimos:

- Login válido/inválido.
- Logout.
- Refresh mantendo sessão.
- Club protegido.
- Admin protegido.
- API cookie Auth.js.
- API motor-token.
- Reset de senha.
- Deleção de conta.
- Notification bell.

Sucesso:

- Existe evidência executável ou checklist manual com data, ambiente e resultado.
- Fluxos atuais conhecidos antes da troca.

Falha:

- Alterar auth sem baseline.

### 6. Implementar B1 middleware

Sucesso:

- Supabase Bearer bloqueado.
- Matriz por rota aplicada.
- Logs seguros indicam decisão de auth.

Falha:

- Bearer genérico autentica usuário.
- Rota admin protegida apenas por sessão.

### 7. Implementar B2 login Auth.js Credentials

Sucesso:

- Login usa Auth.js.
- Senha valida contra fonte canônica.
- Usuários sem senha migrada têm fluxo definido.

Falha:

- Senha legada sem migração gera bloqueio sem explicação.
- Auth.js cookie falha em prod-like.

### 8. Implementar B3 admin session

Sucesso:

- Admin usa `auth()` ou equivalente.
- Role vem do banco.
- Logout limpa cookie.

Falha:

- Role vem do client/JWT não verificado.
- Cookie Supabase antigo funciona.

### 9. Instrumentar e resolver B4 fallbacks

Sucesso:

- Fallbacks medidos.
- Remoção só ocorre com acionamento `0` ou decisão documentada.
- Erro explícito substitui fallback removido.

Falha:

- Remoção cega.

### 10. Resolver B5 deleção de conta

Sucesso:

- Política definida e implementada, ou ação desabilitada no frontend e backend.
- Supabase `deleteUser` removido.

Falha:

- Botão permanece ativo sem política.
- API direta ainda deleta parcialmente.

### 11. Resolver B6 notificações e B8 realtime

Sucesso:

- Notificações usam ID canônico Auth.js/banco.
- Supabase realtime removido.
- Polling tem backoff, dedupe, pausa sem sessão e comportamento em aba oculta.

Falha:

- Client envia `userId`.
- Polling roda em loop ou vaza notificações.

### 12. Executar B7 env final, build, testes e rollback drill

Comandos:

```bash
env -u NEXT_PUBLIC_SUPABASE_URL \
    -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
    -u SUPABASE_SERVICE_ROLE_KEY \
    -u SUPABASE_URL \
    -u SUPABASE_ANON_KEY \
    npm run build

npm test -- --runInBand 2>/dev/null || npm test
npx prisma validate
npx prisma migrate status
```

hipotese H-CI-1: os comandos de teste reais existem. Decisão pendente: confirmar `package.json`.

Sucesso:

- Build passa sem env Supabase.
- Testes críticos passam.
- Prisma continua apontando para Railway.
- Rollback de auth foi ensaiado ou documentado com commit alvo.

Falha:

- Build precisa de Supabase.
- Testes não cobrem auth.
- Não há caminho claro para voltar auth sem desfazer config.

## O que pode quebrar produção silenciosamente

1. Cookie Auth.js não emitido corretamente atrás do proxy Railway.
   - Sinal: login retorna sucesso, refresh perde sessão.
   - Controle: teste prod-like com domínio real, `AUTH_SECRET`, `AUTH_URL` ou `NEXTAUTH_URL`, e configuração de trust host validada.

2. Usuários migrados do Supabase não têm senha no banco.
   - Sinal: todo login antigo falha após trocar Credentials.
   - Controle: consulta de contagem de usuários sem credencial migrada antes do corte.

3. Role admin depende de metadata Supabase.
   - Sinal: admin perde acesso ou usuário comum ganha acesso por fallback.
   - Controle: role canônica no banco e teste admin/comum/sem sessão.

4. Bearer token legado continua aceito.
   - Sinal: API protegida aceita token que não deveria.
   - Controle: testes negativos com Bearer inválido e Bearer Supabase antigo.

5. Reset de senha aponta para fluxo Supabase morto.
   - Sinal: e-mail de reset chega com link quebrado ou callback morto.
   - Controle: testar reset real em staging com domínio canônico.

6. Deleção de conta apaga só auth legado.
   - Sinal: usuário perde login, mas dados e sessão ficam inconsistentes.
   - Controle: política B5 e bloqueio backend até definição.

7. Notification bell mistura IDs legados e Auth.js.
   - Sinal: notificação vazia para usuários existentes ou vazamento cruzado.
   - Controle: mapeamento explícito e teste usuário A/B.

8. Build passa por fallback, runtime falha.
   - Sinal: CI verde, produção quebra ao executar rota.
   - Controle: remover `buildFallback` Supabase só depois de B1 a B6 e rodar smoke prod-like.

9. Logs temporários vazam segredo.
   - Sinal: token/cookie aparece em Railway logs.
   - Controle: redaction antes de logar e revisão por `rg` de padrões sensíveis.

10. Playwright testa ambiente errado.
    - Sinal: testes verdes contra Vercel antigo ou local.
    - Controle: logar `baseURL` no início do teste sem credenciais e falhar se domínio não for aprovado.

## Contra-argumentos e tensões

### Contraponto 1: "Remover Supabase rápido reduz superfície de risco"

Resposta operacional: correto apenas para código comprovadamente morto. Em auth, remoção cega aumenta risco porque pode trocar uma dependência externa quebrada por falha silenciosa de identidade. A remoção deve ser agressiva depois do inventário B0 e dos testes de caracterização.

Critério de decisão:

- Se ocorrência é `runtime-server` ou `runtime-client`, não remover sem substituto testado.
- Se ocorrência é `test`, `doc` ou `morto` comprovado, remover ou atualizar no mesmo ciclo.

### Contraponto 2: "Compatibilidade temporária prolonga dívida técnica"

Resposta operacional: compatibilidade sem data e métrica é dívida. Compatibilidade com log, métrica, critério de corte e fallback explícito é controle de migração.

Critério de decisão:

- Fallback temporário precisa ter dono, métrica, prazo e condição de remoção.
- Fallback sem esses itens deve ser removido ou bloqueado.

### Contraponto 3: "Polling 30s é regressão contra realtime"

Resposta operacional: é regressão aceitável se notificações não forem críticas e se houver critério de latência/custo. Se notificações exigirem entrega sub-10s ou alto volume, SSE deve subir de prioridade.

Critério de decisão:

- Polling aprovado se latência de até 35s em aba ativa for aceitável e custo de queries estiver dentro do limite definido.
- SSE obrigatório se produto exigir latência menor, se polling gerar custo alto, ou se volume simultâneo exceder capacidade medida.

### Contraponto 4: "Auth.js Credentials pode ser menos seguro que provedor gerenciado"

Resposta operacional: pode ser, se senha, rate limit, hash, reset e auditoria forem improvisados. A migração só é aceitável se a senha tiver hash forte, validação constante, rate limit e reset seguro.

Critério de decisão:

- Sem política de hash e rate limit, não promover Credentials para produção.
- Sem reset de senha funcional, usuários sem senha migrada não podem ser cortados.

### Contraponto 5: "Desabilitar deleção de conta é ruim para UX"

Resposta operacional: pior é uma deleção parcial que cria inconsistência legal e operacional. Desabilitar temporariamente é aceitável se a mensagem for clara, houver canal alternativo e backend bloquear a ação.

Critério de decisão:

- Se B5 não tem política aprovada, deleção self-service fica indisponível.
- Solicitação manual deve ter procedimento interno definido antes de comunicar suporte.

### Contraponto 6: "Tornar Supabase env opcional cedo destrava build"

Resposta operacional: destrava build, mas pode esconder runtime quebrado. Supabase env só vira opcional depois que caminhos runtime foram removidos ou bloqueados.

Critério de decisão:

- Antes de B1 a B6, manter falha explícita é preferível a fallback falso.
- Depois de B1 a B6, Supabase env obrigatória vira bug.

## Hipóteses e pontos em disputa

| ID | Hipotese | Risco se falsa | Como validar | Decisão pendente |
|---|---|---|---|---|
| H-PM | O projeto usa npm e scripts padrão | Comandos de build/test falham | Ler lockfile e `package.json` | Ajustar comandos para pnpm/yarn/npm |
| H-DB-1 | Prisma usa `directUrl = env("DIRECT_URL")` quando necessário | Migration usa conexão errada | Ler `schema.prisma` | Confirmar `DATABASE_URL`/`DIRECT_URL` |
| H-E2E-1 | Playwright está instalado e usado | Critérios E2E precisam alternativa | Procurar config/scripts | Definir teste manual/API se não houver |
| H-TEST-1 | Existem testes ou será viável criar testes críticos | Migração sem baseline | Ler `tests`, `e2e`, scripts | Definir cobertura mínima |
| H-B1-1 | `api/middleware.ts:194-201` ainda corresponde ao branch Supabase Bearer | Editar trecho errado | `nl -ba api/middleware.ts` | Confirmar localização real |
| H-B2-1 | Senhas compatíveis com Auth.js Credentials estão no banco | Usuários não conseguem login | Inspecionar schema e dados | Criar migração/reset |
| H-B2-2 | Algoritmo de hash é conhecido | Verificação insegura ou impossível | Procurar bcrypt/argon2/etc | Definir política de hash |
| H-B2-3 | Há usuários sem senha migrada | Corte bloqueia usuários | Consulta no banco | Definir reset obrigatório |
| H-B2-4 | Railway/Auth.js precisa configuração específica de trust host | Cookie/callback falha em produção | Teste prod-like | Ajustar config Auth.js |
| H-B3-1 | Role admin existe em fonte canônica no banco | Autorização fica ambígua | Inspecionar schema e seeds | Definir role canônica |
| H-B4-1 | Há observabilidade para contar fallbacks | Remoção sem evidência | Validar logs/APM/Railway | Definir mecanismo |
| H-B4-2 | 24h de produção dá tráfego suficiente | Falso zero de fallback | Ver volume real | Ajustar janela |
| H-B5-1 | Não há política formal de deleção | Deleção parcial/insegura | Procurar docs/código | Aprovar política ou desabilitar |
| H-B6-1 | `session.user.id` é ID canônico | Notificações somem ou vazam | Inspecionar adapter/schema | Mapear IDs |
| H-B6-2 | IDs Supabase legados existem em notificações | Histórico inacessível | Consulta no DB | Migração ou compat mapping |
| H-B6-3 | Existe mapeamento legado determinístico | Usuários antigos quebram | Ver tabelas/colunas | Criar tabela de mapeamento ou reset |
| H-B7-1 | Ambiente aceita `env -u ... npm run build` | Teste de env inconclusivo | Rodar comando local/CI | Adaptar para CI |
| H-B8-1 | Há índice por usuário/data/status em notificações | Polling caro/lento | Inspecionar schema e explain | Criar índice |
| H-B8-2 | Staging tem volume representativo | p95 enganoso | Comparar volume staging/prod | Teste de carga leve |
| H-B8-3 | Volume de usuários simultâneos é conhecido | Polling pode custar caro | Métricas de tráfego | Definir limite antes de produção |
| H-CI-1 | Scripts de teste reais existem | Plano de verificação não executa | Ler `package.json` | Criar scripts ou checklist manual |

## Riscos e falhas previsíveis

### R1. Corte parcial de auth

Falha: login migra para Auth.js, mas middleware/admin/notificações ainda esperam Supabase.

Controle:

- B1, B2, B3 e B6 devem ser tratados como cadeia única.
- Deploy parcial só pode ir para staging.
- Produção exige checklist dos fluxos críticos.

Sinal verificável:

- `rg` sem Supabase runtime nos pontos críticos.
- Testes de login, admin, API e notification passam no mesmo ambiente.

### R2. Ambiguidade de identidade

Falha: Supabase user id, Prisma user id e Auth.js user id divergem.

Controle:

- Definir ID canônico.
- Criar mapeamento legado se necessário.
- Proibir `userId` vindo do client para dados sensíveis.

Sinal verificável:

- Consulta de notificação usa usuário autenticado no server.
- Teste A/B confirma isolamento.

### R3. Autorização acoplada à autenticação

Falha: estar logado vira suficiente para admin.

Controle:

- Role/admin sempre buscada na fonte canônica.
- Teste usuário comum em rota admin.

Sinal verificável:

- Usuário comum recebe `403`.
- Sem sessão recebe `401`.

### R4. Config falsa positiva

Falha: build passa por placeholders, runtime quebra em rota real.

Controle:

- Remover fallbacks Supabase após B1 a B6.
- Build prod-like sem env Supabase.
- Smoke test de rotas reais.

Sinal verificável:

- `env -u ... npm run build` passa.
- Smoke test acessa login, rota protegida e API.

### R5. Vazamento de segredo em logs

Falha: logs temporários imprimem Authorization, cookie, JWT ou env.

Controle:

- Logging por enum de decisão e hash truncado quando necessário.
- `rg` em código de logs antes do deploy.

Comando:

```bash
rg -n --hidden --glob '!node_modules' --glob '!*.lock' 'console\.log|logger\.|Authorization|cookie|AUTH_SECRET|DATABASE_URL|SERVICE_ROLE|token' .
```

Sinal verificável:

- Logs mostram tipo de auth, rota e resultado, sem segredo.

### R6. Reset de senha morto

Falha: usuários sem senha migrada não conseguem recuperar acesso.

Controle:

- B2 exige decisão para usuários sem senha.
- Testar reset em staging com domínio canônico.

Sinal verificável:

- Link de reset abre domínio correto.
- Nova senha permite login Auth.js.

### R7. Deleção inconsistente

Falha: usuário é apagado parcialmente.

Controle:

- B5 exige política ou bloqueio.
- Backend bloqueia ação quando política estiver pendente.

Sinal verificável:

- Chamada direta à API de deleção retorna indisponível se sem política.
- Supabase `deleteUser` não existe em runtime.

### R8. Polling caro ou ruidoso

Falha: polling de notificações gera carga desnecessária.

Controle:

- Pausar sem sessão.
- Reduzir em aba oculta.
- Backoff em erro.
- Limitar endpoint e usar índice.

Sinal verificável:

- Network tab não mostra overlap.
- Logs não mostram avalanche após erro.
- p95 do endpoint dentro da meta definida.

### R9. Ambiente de teste errado

Falha: validações rodam contra local ou Vercel antigo.

Controle:

- Base URL explícita.
- Falhar se domínio não estiver na allowlist do ambiente.
- Logar ambiente no início do teste.

Sinal verificável:

- Playwright/curl usa domínio canônico esperado.
- `rg 'vercel\.app'` não encontra fallback ativo.

### R10. Rollback inviável

Falha: config Railway e auth ficam misturadas no mesmo commit.

Controle:

- Commits isolados.
- Plano para reverter auth sem desfazer DB.
- Feature flag apenas se tiver default seguro e prazo de remoção.

Sinal verificável:

- `git log --oneline` mostra commits separados por escopo.
- Reversão de auth é identificável.

## Critérios de aceite globais

A remediação só pode ser considerada pronta quando todos os itens abaixo forem verdadeiros:

- B0 concluído com inventário completo.
- B1 a B8 aprovados ou explicitamente marcados como bloqueados com mitigação.
- Build passa sem envs Supabase.
- Prisma valida e migration status aponta para Railway.
- Nenhuma URL Supabase ou Vercel antiga aparece em runtime ativo.
- Login válido, login inválido, logout, refresh, club protegido, admin protegido, API cookie, API motor-token, reset de senha, deleção de conta e notification bell foram testados.
- Deleção de conta está implementada com política ou bloqueada no frontend e backend.
- Notificações não dependem de Supabase realtime.
- Logs de auth não vazam segredo.
- Existe rollback documentado por commit ou branch.

Comandos finais mínimos:

```bash
rg -n --hidden --glob '!node_modules' --glob '!.next' --glob '!dist' --glob '!coverage' --glob '!*.lock' 'supabase\.co|pooler\.supabase|vercel\.app|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE|signInWithPassword|admin\.deleteUser|admin\.signOut|auth\.getUser|channel\(|broadcast' .

npx prisma validate
npx prisma migrate status

env -u NEXT_PUBLIC_SUPABASE_URL \
    -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
    -u SUPABASE_SERVICE_ROLE_KEY \
    -u SUPABASE_URL \
    -u SUPABASE_ANON_KEY \
    npm run build
```

Interpretação do `rg` final:

- Resultado em docs, testes ou código legado bloqueado é aceitável somente se classificado no inventário.
- Resultado em runtime ativo é falha.

## Conclusão operacional

A ordem defensável não é "remover Supabase" primeiro. A ordem correta é provar onde Supabase ainda participa de identidade, sessão, autorização, reset, deleção e notificações, criar baseline, trocar os caminhos críticos por Auth.js e banco canônico, e só então tornar as envs Supabase opcionais.

A decisão mais importante é definir identidade canônica e política de senha/deleção. Sem isso, a migração pode parecer concluída no build e quebrar produção no primeiro login, reset, admin ou notification bell.

Próximo passo obrigatório: executar B0 e preencher o inventário. Sem B0 aprovado, qualquer mudança em B1 a B8 é intervenção cega em auth.