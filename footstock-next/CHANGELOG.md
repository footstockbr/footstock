# Changelog

Todas as mudanças notáveis do Foot Stock são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] — Railway Consolidation (2026-05-06)

### Changed
- **Infra:** Migração completa de Vercel + Supabase para Railway (consolidado)
  - Web (Next.js): deploy via Dockerfile standalone no Railway (`railway up --service web`)
  - Motor: já no Railway, otimizado (tick 2s → 10s, persistência 8s → 5min)
  - Banco: PostgreSQL Railway (runbook de cutover em `runbooks/RUNBOOK-016-db-cutover-supabase-to-railway.md`)
  - Cache: Redis Railway (runbook em `runbooks/RUNBOOK-015-railway-redis-provision.md`)
  - DNS: Cloudflare → Railway (`stream.footstock.com.br`, `api.footstock.com.br`)
- **SSE:** Endpoints de streaming movidos do Vercel para o motor (`/stream/market`, `/stream/news`)
- **Cron jobs:** 19 crons migrados do Vercel para scheduler interno do motor (`node-cron` + leader election)
- **CI/CD:** GitHub Actions substituíram `vercel deploy` por `railway up`

### Removed
- `vercel.json` (root e `footstock-next/`)
- Diretório `.vercel/`

---

## [1.0.0] - 2026-04-01

### Milestone 11 — Finalização e Entrega (R$ 663,00)

_(baseado em BUDGET.md — release notes não encontradas)_

Versão de produção do Foot Stock. Todos os ajustes finais aplicados,
imperfeições identificadas nos testes corrigidas, sistema publicado e
documentação de entrega preparada.

### Added
- Arquivo `.env.production.example` com 31 variáveis documentadas para deploy
- Smoke tests automatizados em produção (`tests/e2e/smoke-production.spec.ts`)
- CORS configurado via `next.config.ts` com suporte a múltiplos ambientes
- Rate limiting no endpoint `/api/v1/ai/analyze` (10 análises/hora por usuário)
- HANDOFF.md e documentação de entrega ao cliente
- Instruções de deploy, seed de produção e checklist de smoke tests

### Fixed
- Type predicate em `SuspendDialog.tsx` corrigido para `Array<HTMLElement | null>`
- Função `calculateFee` exportada de `@/lib/constants/limits` (era importada mas não existia)
- Variável `remaining` removida de destructuring não utilizado em `ai/analyze/route.ts`

### Changed
- `playwright.config.ts` atualizado com suporte a `TEST_ENV=production` e `PROD_URL`

---

## [0.10.0] - 2026-04-01

### Milestone 10 — Monitoramento, Testes e Integração Final (R$ 843,00)

_(baseado em BUDGET.md — release notes não encontradas)_

### Added
- Monitoramento com Sentry ativo, rastreando erros em tempo real
- Alertas automáticos quando motor de mercado, banco de dados ou servidor ultrapassam limites críticos
- Validação automática dos 11 contratos de integração entre subsistemas
- Testes de integração E2E cobrindo fluxos críticos: cadastro, primeira compra, venda, consulta ao assessor IA e cancelamento de plano
- Suite de testes de contrato (`api-contract.test.ts`, `billing-audit.test.ts`)
- Scripts k6/Artillery para testes de carga

---

## [0.9.0] - 2026-04-01

### Milestone 9 — Moderação, Portal dos Clubes e DevOps (R$ 731,00)

_(baseado em BUDGET.md — release notes não encontradas)_

### Added
- Moderação automática do fórum com remoção de dados pessoais antes da publicação
- Lista configurável de palavras bloqueadas no fórum
- Sistema de banners publicitários em 5 posições do app, integrado ao painel administrativo
- Portal exclusivo dos clubes parceiros (`/club-portal`) com acesso separado
- Dashboard institucional para representantes dos clubes acompanharem dados dos torcedores
- Pipeline de deploy automatizado (CI/CD) configurado para publicações sem tempo de inatividade
- Infraestrutura de patrocinadores com 5 posições de banner gerenciáveis

---

## [0.8.0] - 2026-04-01

### Milestone 8 — Assessor IA e Painel Administrativo (R$ 911,00)

_(baseado em BUDGET.md — release notes não encontradas)_

### Added
- Assessor IA em `/assessor?ativo={slug}` com análise do ativo selecionado (plano Craque+)
- Integração com Claude (Anthropic) para geração de análises fundamentalistas
- Painel administrativo completo para SuperAdmin e Administradores
- Gestão de usuários: busca, suspensão, alteração de plano, visualização de histórico
- Gestão de ativos: ajuste manual de preços, halt/resume por ticker
- Dashboard de métricas: receita, usuários ativos, volume negociado
- Painel DPO: gestão de exports LGPD e logs de consentimento
- Controle de ligas: criação, edição, encerramento
- Auditoria completa de ações administrativas com logging

---

## [0.7.0] - 2026-04-01

### Milestone 7 — Comunidade, Notificações e Ligas (R$ 793,00)

_(baseado em BUDGET.md — release notes não encontradas)_

### Added
- Fórum de comunidade com posts, comentários e reações por ativo
- Glossário de termos financeiros do mercado de futebol
- Sistema de push notifications via Web Push API (VAPID)
- Notificações de execução de ordem, pagamento de dividendos e alertas de preço
- Preferências de notificação por canal (push, email) e categoria
- Ligas de investidores: pública, privada e patrocinada
- Ranking de ligas com classificação por rentabilidade
- Convites para ligas privadas via link ou código

---

## [0.6.0] - 2026-04-01

### Milestone 6 — Carteira, Dividendos e Notícias (R$ 733,00)

_(baseado em BUDGET.md — release notes não encontradas)_

### Added
- Dashboard completo de carteira em `/portfolio` com patrimônio total e P&L por posição
- Gráfico de evolução patrimonial com 7 períodos (1D, 1S, 1M, 3M, 6M, 1A, Desde Início)
- Sistema de dividendos virtuais: pagamento mensal por tipo de clube (A_TOP, A_MID, etc.)
- Feed de notícias reais integrado (ESPN Brasil, GloboEsporte, Lance)
- Classificação de notícias por impacto (POSITIVO, NEUTRO, NEGATIVO) no ativo associado
- Histórico de dividendos recebidos por posição

---

## [0.5.0] - 2026-04-01

### Milestone 5 — Pagamentos, Compliance e Motor de Ordens (R$ 928,00)

### Added
- Checkout Mercado Pago com Pix QR Code e cartão de crédito/débito
- Checkout PagSeguro com cartão de crédito e débito
- Checkout PayPal para pagamento internacional
- Cobrança recorrente com dunning automático (3 tentativas)
- Lembrete de renovação 7 dias antes do vencimento
- Crédito diferencial de FS$ no upgrade de plano após período de arrependimento
- Gestão de consentimentos LGPD por finalidade (essencial, analytics, marketing, terceiros)
- Exportação completa de dados pessoais em JSON e CSV
- Exclusão de conta com anonimização de dados (retenção financeira 5 anos)
- Página de política de privacidade pública (`/privacy`)
- Painel DPO no admin para gestão de exports e logs
- Ordem a mercado — execução no próximo tick de 2 segundos
- Ordem limitada — aguarda preço atingir o alvo definido
- Ordem agendada — execução em data e hora futura
- Ordem OCO — par vinculado (Stop Loss + Take Profit), uma cancela a outra
- Short selling — venda a descoberto com margem 150%, aluguel diário 0,5%
- Margin call automático com liquidação de posições em risco
- Extrato completo de transações com P&L por posição
- Expiração automática de ordens pendentes após 30 dias

---

## [0.4.0] - 2026-04-01

### Milestone 4 — Mercado de Ativos e Planos (R$ 810,00)

_(baseado em BUDGET.md — release notes não encontradas)_

### Added
- Página `/mercado` com lista completa dos 40 ativos e preços em tempo real
- Cards de ativos com preço atual, variação percentual e volume
- Página `/ativo/[slug]` com gráfico de preço histórico e book de ordens
- Gráficos de candlestick e linha com períodos configuráveis
- Checkout de planos em `/planos` (Jogador gratuito, Craque R$19,90/mês, Lenda R$49,90/mês)
- Diferenciação de acesso por plano: delay de cotações para Jogador, real-time para Craque+
- Visualização do book de ordens (plano Lenda)
- Botões de compra/venda integrados à página do ativo

---

## [0.3.0] - 2026-04-01

### Milestone 3 — Motor de Mercado e Base de Dados (R$ 1.106,00)

### Added
- Motor de precificação standalone em Node.js 22 (`motor/`) com processo independente
- 9 camadas quantitativas: Order Flow Imbalance, Âncora OU, GARCH, OFI, Kyle Lambda, Supply Scaling, Pressure Queue, Velocity Cap, Circuit Breaker
- Tick de 2 segundos calculando 40 ativos simultaneamente
- Leader election via Redis SETNX com TTL 30s e Lua scripts atômicos
- Circuit breaker ativando em variação ≥ 8%, pausando ativo por ~5 minutos
- OrderBook com matching automático de LIMIT, STOP_LOSS, TAKE_PROFIT a cada tick
- SSE endpoint `/api/v1/market/stream` com diferenciação por plano
- Controles admin: halt/resume por ticker e global, news inject, audit logging
- 5 sessões de mercado BRT: PRÉ_ABERTURA, NEGOCIAÇÃO, CALL, AFTER_MARKET, FECHADO
- 6 agentes simulados: MarketMaker, Momentum, Contrarian, ValueInvestor, RandomTrader, PanicSeller
- Schema Prisma com 31 models e 24 enums
- 29 migrations aplicáveis (M001-M029)
- Seed idempotente de 40 clubes (20 Série A + 20 Série B) com valuation real
- 5 clusters de ativos: A_TOP, A_MID, A_SMALL, B_LIQUID, B_ILLIQ
- 6 repositories tipados: User, Asset, Order, Position, Transaction, PriceHistory
- Onboarding 3 etapas: Perfil Investidor → Plano → Tour
- 4 perfis de investidor: INICIANTE, INTERMEDIÁRIO, AVANÇADO, FÃ
- Tour guiado com 5 passos personalizados por perfil
- Página `/perfil` com dados do usuário e plano atual
- Exportação de dados pessoais (202 Accepted + job assíncrono)
- Exclusão de conta com anonimização de PII

### Security
- `GET /api/v1/users/me` sem exposição de `cpfHash`
- `PATCH /api/v1/users/me` com `.strict()` contra mass assignment

---

## [0.2.0] - 2026-03-31

### Milestone 2 — Infraestrutura e Autenticação (R$ 1.106,00)

### Added
- Cadastro completo em 4 etapas (wizard mobile-first): dados pessoais, credenciais, clube favorito, aceite de termos LGPD
- Verificação de maioridade por autodeclaração de data de nascimento com confirmação explícita pelo usuário (bloqueio automático de menores de 18 anos)
- Login com email e senha com rate limiting (10 tentativas a cada 5 minutos)
- Infraestrutura de biometria WebAuthn (Face ID / Touch ID) — botão presente, ativação completa em milestone futura
- Recuperação de senha (solicitar link → receber email → redefinir → login)
- Splash screen animada com logo do Foot Stock (2.8 segundos, tema escuro)
- Design system dark-only com 82 tokens de design e 21 componentes base
- Navegação mobile-first com barra inferior responsiva
- Sistema de permissões RBAC com 6 perfis hierárquicos (SuperAdmin, Administrador, Monitor, Editor, Moderador, Club Partner) e controle de 25 recursos
- Health check `/api/v1/health` monitorando banco de dados e Redis
- Infraestrutura SSE + Redis pub/sub pronta para dados de mercado em tempo real
- Consentimentos LGPD salvos com timestamp, IP, user agent e versão dos termos (Art. 18 LGPD)

### Security
- Rate limiting em todos os endpoints críticos de autenticação
- Mensagens genéricas de login que não revelam existência do email

---

## [0.1.0] - 2026-03-31

### Milestone 1 — Elaboração da Documentação e Aceite (R$ 1.106,00)

### Added
- PRD com 16 funcionalidades existentes do protótipo + 12 novas + 6 melhoradas
- 40 histórias de uso (USER-STORIES.md) com cenários de sucesso, erro, casos especiais e LGPD
- Arquitetura HLD (visão geral) e LLD (detalhamento técnico com ERD)
- Especificação OpenAPI (`openapi.yaml`) com todos os endpoints da API
- DESIGN.md com identidade visual: tema escuro, mobile-first, paleta de cores
- THREAT-MODEL.md com análise de ameaças STRIDE
- PRIVACY-ASSESSMENT.md com mapeamento de dados pessoais (LGPD/GDPR)
- ERROR-CATALOG.md com todos os códigos de erro do sistema
- 7 FDDs: Motor de Mercado, Trading & Carteira, UI de Mercado & Ativos, Notícias & Comunidade, Ligas & Assessor IA, Monetização & Compliance, Painel Administrativo
- 6 ADRs: arquitetura híbrida Vercel+Railway, Supabase, moeda virtual pura, e demais decisões técnicas
- DOC-INDEX.md como índice navegável de 35 documentos (22.515 linhas)
- BUDGET.md com valores, prazos e condições (R$ 9.730,00 em 11 entregas)
- MILESTONES.md como fonte de verdade das 11 etapas do projeto

---

[1.0.0]: https://github.com/foot-stock/footstock-next/compare/v0.10.0...v1.0.0
[0.10.0]: https://github.com/foot-stock/footstock-next/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/foot-stock/footstock-next/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/foot-stock/footstock-next/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/foot-stock/footstock-next/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/foot-stock/footstock-next/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/foot-stock/footstock-next/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/foot-stock/footstock-next/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/foot-stock/footstock-next/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/foot-stock/footstock-next/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/foot-stock/footstock-next/releases/tag/v0.1.0
