# Gerenciamento de Variáveis de Ambiente — Foot Stock

**Versão:** 1.0  
**Data:** 2026-04-01  
**Status:** Segurança de credenciais

---

## 🔒 Política de Segurança

### Regra Principal

**NUNCA commitar arquivos `.env*` com valores reais.** Todos os `.env` estão no `.gitignore` e permanecerão assim.

### Arquivos Protegidos

```
.env                    → LOCAL development (não versionar)
.env.local              → LOCAL overrides (não versionar)
.env.development        → DEV environment (não versionar)
.env.staging            → STAGING environment (não versionar)
.env.production          → PRODUCTION environment (não versionar)
.env.docker             → Docker dev (não versionar)
.env.deploy             → Credenciais MCP Sync (não versionar)
.env.test               → Testes de integração (não versionar)
```

### Arquivos PERMITIDOS para Versionar

```
.env.example            → Template com placeholders (seguro)
.env.docker.example     → Template Docker com placeholders (seguro)
.env.*.example          → Qualquer template com example (seguro)
```

---

## 🚀 Workflow por Ambiente

### 1. DESENVOLVIMENTO (local)

**Arquivo:** `.env` (criado automaticamente por `/env-creation`, ignorado pelo git)

```bash
# Passo 1: Executar setup
/env-creation

# Passo 2: .env é criado com valores de DEV
# (banco local Docker, Supabase DEV, Upstash DEV, etc.)

# Passo 3: Valores DEV são específicos deste dev — nunca compartilham com PROD
```

**Regra:** Cada desenvolvedor tem seu próprio `.env` local. Valores NÃO são sincronizados via git.

---

### 2. STAGING (pre-production)

**Arquivo:** `.env.staging` (template não versiona credenciais)

```bash
# Staging é deployado via:
#   1. Vercel Environment Variables (GitHub Secrets)
#   2. Railway Environment Variables
#   3. Manual setup em .env.staging (local testing)

# Credenciais são armazenadas em:
#   - GitHub Secrets (CI/CD)
#   - Vercel Console (deployment)
#   - Railway Dashboard (serviço Motor)
```

**Regra:** Arquivo `.env.staging` com valores reais fica LOCAL apenas. NÃO é commitado.

---

### 3. PRODUCTION (live)

**Arquivo:** `.env.production` (template, NUNCA valores reais)

```bash
# Production é deployado via:
#   1. Vercel Environment Variables (GitHub Secrets)
#   2. Railway Environment Variables
#   3. AWS Secrets Manager (se necessário)

# Credenciais NUNCA existem no repositório.
# Tokens são rotacionados antes de cada deploy.
```

**Regra:** ZERO credenciais no `.env.production`. Tudo em secrets manager externo.

---

## 📋 Estrutura de Credenciais por Ambiente

| Serviço | DEV | STAGING | PROD | Armazenamento |
|---------|-----|---------|------|----------------|
| **Supabase (DB)** | Projeto DEV | Projeto STAGING | Projeto PROD | GitHub Secrets + Vercel |
| **Supabase (Service Role)** | Dev key | Staging key | Prod key | **NÃO em repo** |
| **GitHub Token** | Personal token (local) | CI/CD token | CI/CD token | GitHub Secrets |
| **Vercel Token** | Personal token (local) | Admin token | Admin token | GitHub Secrets |
| **Railway Token** | - | Staging service | Prod service | GitHub Secrets |
| **Anthropic API** | Teste/free tier | Staging key | Prod key | GitHub Secrets |
| **Sentry** | Dev org | Staging project | Prod project | GitHub Secrets |
| **Upstash Redis** | Local Redis | Upstash DEV | Upstash PROD | GitHub Secrets |

**Padrão:** Cada ambiente (DEV/STAGING/PROD) tem **credenciais SEPARADAS**. Nunca reutilizar.

---

## 🔑 Como Configurar Credenciais

### Primeira Vez (Setup Inicial)

```bash
# 1. Copiar template
cp .env.example .env

# 2. Preencher valores DEV locais
nano .env
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/foot_stock_dev"
# SUPABASE_URL="https://[seu-projeto-dev].supabase.co"
# SUPABASE_ANON_KEY="[chave anonima dev]"
# ... etc

# 3. NUNCA commitar
# (já está em .gitignore)

# 4. Pronto para desenvolver!
npm run dev
```

### CI/CD / Deployments (GitHub Actions)

```bash
# 1. Configurar GitHub Secrets
# GitHub → Settings → Secrets → New secret
#   DATABASE_URL = [postgresql://...]
#   SUPABASE_SERVICE_ROLE_KEY = [eyJ...]
#   VERCEL_TOKEN = [vcp_...]
#   GITHUB_TOKEN = [ghp_...]
#   ... etc

# 2. Workflow acessa via ${{ secrets.DATABASE_URL }}
# (See .github/workflows/deploy.yml)

# 3. Deploy usa secrets, nunca valores em repo
```

---

## ⚠️ Checklist de Segurança

Ao fazer deploy ou atualizar credenciais:

- [ ] Nenhum arquivo `.env*` (exceto `.example`) foi commitado
- [ ] `.gitignore` cobre **todos** os tipos de `.env*`
- [ ] Credenciais estão em **GitHub Secrets** (não em código)
- [ ] Cada ambiente tem **chaves DIFERENTES**
- [ ] Secrets são **ROTACIONADOS** antes de cada deploy importante
- [ ] `.env.example` contém **APENAS placeholders** (`[seu-valor-aqui]`)
- [ ] `.env` local foi criado por `/env-creation` com valores DEV
- [ ] Ninguém compartilhou seu `.env` local via Slack/Email
- [ ] Pre-commit hook bloqueia commits com credenciais (implementar Gitleaks)

---

## 🛡️ Detectar Exposições Acidentais

### Verificar se credencial foi commitada

```bash
# Buscar por padrões de secrets no histórico
git log -p --all -S "sk-ant-" | head -20
git log -p --all -S "ghp_" | head -20
git log -p --all -S "DATABASE_URL=" | head -20

# Se encontrar: usar git filter-repo para remover
# (Avançado — chamar time de DevOps)
```

### Verificar se arquivo está ignorado

```bash
git check-ignore -v .env
git check-ignore -v .env.deploy
git check-ignore -v .env.staging

# Deve retornar o caminho no .gitignore indicando proteção
```

---

## 📚 Estrutura de Arquivos Atuais

```
output/workspace/foot-stock/
├── .env                        ✅ Ignorado (DEV local)
├── .env.deploy                 ✅ Ignorado (credenciais MCP)
├── .env.docker                 ✅ Ignorado (docker dev)
├── .env.docker.example         ✅ Permissão (template)
├── .env.example                ✅ Permissão (template)
├── .env.production             ✅ Ignorado (template)
├── .env.staging                ✅ Ignorado (staging)
├── .env.test                   ✅ Ignorado (testes)
├── .gitignore                  ✅ Atualizado (proteção máxima)
├── footstock-next/
│   ├── .env                    ✅ Ignorado
│   ├── .env.example            ✅ Permissão
│   └── .gitignore              ✅ Atualizado
└── motor/
    ├── .env                    ✅ Ignorado
    ├── .env.example            ✅ Permissão
    └── .gitignore              ✅ Atualizado
```

---

## 🚨 Próximos Passos (Curto Prazo)

### Antes de Deploy para STAGING

1. **Verificar que nenhuma credencial real será enviada**
   ```bash
   git diff --cached | grep -E "sk-ant|DATABASE_URL|SUPABASE_SERVICE"
   # Deve retornar VAZIO
   ```

2. **Configurar GitHub Secrets com valores STAGING**
   - `DATABASE_URL` (Supabase STAGING)
   - `SUPABASE_SERVICE_ROLE_KEY` (Supabase STAGING)
   - `VERCEL_TOKEN`
   - `RAILWAY_TOKEN`
   - Etc.

3. **Testar deploy**
   ```bash
   git push origin staging
   # GitHub Actions executa com secrets
   ```

### Antes de Deploy para PRODUÇÃO

1. **Gerar NOVAS credenciais para PROD**
   - Supabase: novo projeto PROD
   - GitHub: novo token com escopo limitado
   - Vercel: novo token PROD
   - Etc.

2. **Atualizar GitHub Secrets**
   - Usar prefixo: `PROD_DATABASE_URL`, `PROD_SUPABASE_...`

3. **Validar que credenciais DEV/STAGING não vazaram**
   ```bash
   git log --all | grep -E "sk-ant|eyJ|ghp_"
   # Deve retornar VAZIO
   ```

---

## 📞 Contato / Escalação

Se credenciais foram acidentalmente commitadas:

1. **NÃO fazer push** (já é tarde, mas não piore)
2. **Chamar líder técnico imediatamente**
3. **Revogar credencial** (no provider)
4. **Gerar nova credencial**
5. **Usar `git filter-repo`** para reescrever histórico (avançado)

---

## Referências

- DESIGN.md — Paleta de cores Ouro Premium v2.0
- SECRETS-SCAN-REPORT.md — Auditoria de credenciais
- .gitignore — Proteção de arquivos sensíveis
- GitHub Secrets — Armazenamento de credenciais CI/CD

---

**Última atualização:** 2026-04-01 | **Próxima revisão:** Antes do deploy para PROD

