# ADR - Politica de status de conta em sessao ja emitida

Data: 2026-09-03
Status: implantado no codigo, ainda nao deployado
Decisao tomada por: entrevista AUQ com o operador (4 perguntas), apos debate adversarial

## Contexto

O login (`src/lib/auth-credentials.ts`) sempre barrou quem nao esta `ACTIVE`. O que nao
existia era gate na sessao **ja emitida**: nenhum ponto do runtime lia `user.status` depois
que o cookie estava na mao do usuario. O cron de vencimento
(`src/lib/jobs/subscription-expiry.ts`) vira a conta para `SUSPENDED` com a sessao viva,
entao o suspenso continuava operando ate o cookie expirar. Dois testes `it.failing` em
`tests/integration/security.test.ts` documentavam o buraco desde a auditoria anterior.

O que travava a correcao nao era codigo, era decisao: duas coisas diferentes escreviam
"suspenso" no mesmo usuario e nenhuma das duas era lida como gate.

| Sinal | Quem escreve | Quem lia antes | Papel agora |
|-------|--------------|----------------|-------------|
| `user.status` (enum) | cron de vencimento | so o login | **e o gate** |
| `suspendedAt` / `suspensionReason` | admin e moderacao | ninguem | metadado da sancao |

A rota admin de suspensao gravava so os metadados e respondia `status: "suspended"` sem
suspender nada. Era Zero Silencio invertido: a UI dizia que a sancao existia, o sistema nao
aplicava nenhuma.

## Decisao

1. **Modelo.** A verdade sobre acesso e o enum `user.status`. Admin e moderacao passam a
   gravar `status: 'SUSPENDED'` junto com os metadados; a listagem admin le o enum em vez de
   derivar de `suspendedAt`; o unsuspend restaura `ACTIVE`.
2. **Local.** Um modulo puro, `src/lib/auth/account-status.ts`, chamado pelos **tres** pontos
   de autenticacao do app. O terceiro (`src/lib/auth/server.ts`, homonimo do de `lib/auth.ts`)
   so apareceu ao migrar as rotas e nao estava no censo da entrevista -- e a razao pratica de a
   politica morar num modulo proprio em vez de dentro de um dos caminhos.
3. **Permissoes.** `BANNED` barra tudo, inclusive leitura. `SUSPENDED` barra escrita de
   trading e social; leitura, perfil e billing seguem abertos por allowlist explicita.
4. **Resposta.** 403 com codigo proprio e o motivo da sancao. O cookie continua vivo de
   proposito: 401 faria o front tratar como "faca login de novo" e levaria o usuario para
   longe da tela de reativacao, que e a saida projetada do estado suspenso.

### Codigos de erro: AUTH-004 nao pode ser usado

A decisao nomeou `AUTH-004`, mas esse codigo ja esta ocupado no fio por "email ja cadastrado"
(registro), em `src/lib/constants/errors.ts`. Reusar quebraria consumidor de front que ja
discrimina por codigo. Alocados **AUTH-014** (suspensa) e **AUTH-015** (banida).

Nota: `src/constants/errors.ts` e um catalogo morto, nao importado por nada em `src/`, e com
numeracao divergente. Ficou com aviso no topo em vez de ser sincronizado -- sincronizar dois
catalogos e o que produz a divergencia de novo.

## Consequencias

- **Pagar nao levanta mais sancao administrativa.** Os dois sites de reativacao do
  `PlanService` ganharam `suspensionReason: null` no `where`. O discriminador funciona porque o
  cron nunca grava motivo e admin/moderacao sempre gravam. Sem isso, bastava assinar um plano
  para se auto-anistiar de uma suspensao por conduta.
- **Unsuspend nao devolve acesso pago de graca.** O cron suspende uma vez, na transicao;
  restaurar `ACTIVE` cegamente daria acesso permanente sem assinatura. O unsuspend agora checa
  assinatura `EXPIRED`/`SUSPENDED` e, se houver, mantem a conta suspensa por cobranca,
  devolvendo `note` explicando por que a conta nao voltou.
- **Fail-closed em contexto sem request.** Sem metodo HTTP conhecido, a politica trata como
  mutacao. Chamador que nao sabe dizer o que esta fazendo nao ganha o beneficio da duvida.
- **Duas granularidades de resposta convivem.** Rotas migradas para `getAuthUserOrBlock`
  devolvem 403 com motivo; o restante cai no backstop dentro de `resolveAuthUser`, que so
  consegue devolver 401 (o contrato de `getAuthUser` e `{...} | null`). Ninguem fica sem gate;
  quem ainda nao migrou perde so a granularidade da mensagem.
- **Middleware injeta `x-fs-path` e `x-fs-method`.** E como `getAuthUser`, que nao recebe
  argumento, descobre o formato da request. E edge-safe: nao toca banco.

## Como reverter

Nao ha flag de ambiente. O gate e codigo. Reverter e `git revert` do commit -- o modulo de
politica e os tres call sites saem juntos. Reverter parcialmente (deixar o modulo e tirar um
call site) recria exatamente a divergencia que a decisao 2 existe para impedir.

## Verificacao

- `npx tsc --noEmit` limpo (fora os dois erros pre-existentes em `.next/**/validator.ts`).
- `npm run lint`: 0 erros.
- `npm test` (unit): 1596 passando, incluindo `tests/unit/account-status-policy.test.ts`
  (15 casos, com censo dos tres pontos de autenticacao).
- `npm run test:integration`: os dois `it.failing` viraram `it` e passam. As 5 falhas em
  `orders.test.ts` sao `SESS_040` (mercado fechado no horario da execucao) e reproduzem
  identicas com a mudanca revertida.
- `npm run build` completo.

Nao verificado: comportamento em producao com sessao real de usuario suspenso. O gate nunca
rodou fora de teste.
