#!/usr/bin/env bash
# bootstrap.sh — Setup completo do ambiente local FootStock
# Gerado por /dev-bootstrap-create (SystemForge)
# Uso: ./scripts/bootstrap.sh [--reset|--health]
set -euo pipefail

# === Cores ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[bootstrap]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[erro]${NC} $*" >&2; }

# === Variáveis de Configuração ===
PROJECT_SLUG="foot-stock"
RUNTIME="node"
PKG_MANAGER="npm"
INSTALL_CMD="npm ci"
DEV_CMD="npm run dev"
TEST_CMD="npm test"
MIGRATION_CMD="npx prisma migrate deploy"
SEED_CMD="npm run db:seed"
DOCKER_ENABLED=true
DOCKER_COMPOSE_FILE="docker-compose.yml"

# === Função: Verificar Pré-Requisitos ===
check_prereqs() {
  local missing=()

  log "Verificando pré-requisitos..."

  # Git
  if ! command -v git >/dev/null 2>&1; then
    missing+=("git")
  fi

  # Node.js >= 22
  if ! command -v node >/dev/null 2>&1; then
    missing+=("node (>= 22)")
  else
    local NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -lt 22 ]; then
      missing+=("node >= 22 (atual: $(node -v))")
    fi
  fi

  # npm >= 10
  if ! command -v npm >/dev/null 2>&1; then
    missing+=("npm (>= 10)")
  else
    local NPM_MAJOR=$(npm -v 2>/dev/null | cut -d. -f1)
    if [ "$NPM_MAJOR" -lt 10 ]; then
      missing+=("npm >= 10 (atual: $(npm -v))")
    fi
  fi

  # Docker (if enabled)
  if [ "$DOCKER_ENABLED" = "true" ]; then
    if ! command -v docker >/dev/null 2>&1; then
      missing+=("docker")
    fi
    if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
      missing+=("docker compose")
    fi
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    err "Faltando: ${missing[*]}"
    err "Instale os pré-requisitos acima e tente novamente."
    return 1
  fi

  ok "Pré-requisitos verificados"
  echo "  Node.js: $(node -v)"
  echo "  npm: v$(npm -v)"
  if [ "$DOCKER_ENABLED" = "true" ]; then
    echo "  Docker: $(docker -v | cut -d' ' -f3,4)"
  fi
  return 0
}

# === Função: Garantir .env ===
ensure_env() {
  log "Configurando variáveis de ambiente..."

  if [ -f .env.local ]; then
    ok ".env.local já existe"
    return 0
  fi

  if [ -f .env.example ]; then
    cp .env.example .env.local
    ok ".env.local criado a partir de .env.example"
    warn "Revise .env.local e preencha valores sensíveis (DATABASE_URL, REDIS_URL, JWT_SECRET, etc)"
    return 0
  fi

  warn ".env.local não encontrado e sem template"
  warn "Crie manualmente ou execute /env-creation"
  return 1
}

# === Função: Instalar Dependências ===
install_deps() {
  log "Instalando dependências..."

  if [ ! -d node_modules ] || [ ! -f node_modules/.package-lock.json ] 2>/dev/null; then
    $INSTALL_CMD
    ok "Dependências instaladas"
  else
    ok "Dependências já instaladas"
  fi
}

# === Função: Gerar Prisma Client ===
generate_prisma() {
  log "Gerando Prisma Client..."
  npx prisma generate
  ok "Prisma Client gerado"
}

# === Função: Subir Serviços Docker ===
start_services() {
  log "Subindo serviços Docker..."

  if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
    warn "$DOCKER_COMPOSE_FILE não encontrado"
    return 1
  fi

  # Verificar se já estão rodando
  if docker compose ps --format json 2>/dev/null | grep -q '"State":"running"'; then
    ok "Serviços Docker já estão rodando"
    return 0
  fi

  docker compose up -d

  log "Aguardando health checks (max 120s)..."
  local max_wait=120
  local waited=0
  local healthy_count=0
  local expected_healthy=2 # postgres e redis

  while [ $waited -lt $max_wait ]; do
    healthy_count=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"' || echo 0)

    if [ "$healthy_count" -ge "$expected_healthy" ]; then
      ok "Serviços Docker rodando e saudáveis"
      return 0
    fi

    sleep 2
    waited=$((waited + 2))
  done

  warn "Timeout esperando serviços ficarem healthy (${max_wait}s)"
  warn "Verifique com: docker compose ps"
  return 1
}

# === Função: Parar Serviços Docker ===
stop_services() {
  log "Parando serviços Docker..."
  docker compose down
  ok "Serviços parados"
}

# === Função: Executar Migrations ===
run_migrations() {
  log "Executando migrations..."

  if ! $MIGRATION_CMD; then
    err "Erro ao executar migrations"
    return 1
  fi

  ok "Migrations aplicadas"
}

# === Função: Executar Seeds ===
run_seeds() {
  log "Executando seeds..."

  if ! $SEED_CMD; then
    err "Erro ao executar seeds"
    return 1
  fi

  ok "Seeds aplicados"
}

# === Função: Health Check (Leve) ===
check_health() {
  log "Verificando saúde do ambiente..."
  echo ""

  local errors=0

  # .env.local
  if [ -f .env.local ]; then
    ok ".env.local presente"
  else
    warn ".env.local ausente"
    errors=$((errors + 1))
  fi

  # Node modules
  if [ -d node_modules ]; then
    ok "node_modules instalados"
  else
    warn "node_modules não encontrados"
    errors=$((errors + 1))
  fi

  # Docker services
  if [ "$DOCKER_ENABLED" = "true" ]; then
    if docker compose ps --format json 2>/dev/null | grep -q '"State":"running"'; then
      local healthy=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"' || echo 0)
      if [ "$healthy" -ge 2 ]; then
        ok "Serviços Docker rodando (postgres, redis)"
      else
        warn "Serviços Docker rodando, mas nem todos saudáveis (healthy: $healthy)"
        errors=$((errors + 1))
      fi
    else
      warn "Serviços Docker não estão rodando"
      errors=$((errors + 1))
    fi
  fi

  # Prisma Client
  if [ -d node_modules/.prisma ]; then
    ok "Prisma Client gerado"
  else
    warn "Prisma Client não encontrado"
    errors=$((errors + 1))
  fi

  echo ""
  if [ $errors -eq 0 ]; then
    ok "Ambiente saudável ✓"
    return 0
  else
    warn "$errors problema(s) encontrado(s) — verifique acima"
    return 1
  fi
}

# === Função: Resumo ===
show_summary() {
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  BOOTSTRAP COMPLETO${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  Para iniciar o dev server:"
  echo "    npm run dev"
  echo ""
  echo "  Para parar serviços Docker:"
  echo "    docker compose down"
  echo ""
  echo "  Para rodar testes:"
  echo "    npm test"
  echo ""
  echo "  Para resetar tudo:"
  echo "    ./scripts/bootstrap.sh --reset"
  echo ""
  echo "  Para verificar saúde do ambiente:"
  echo "    ./scripts/bootstrap.sh --health"
  echo ""
}

# === Função: Reset (Limpeza Completa) ===
do_reset() {
  warn "Resetando ambiente..."
  echo ""

  if [ "$DOCKER_ENABLED" = "true" ]; then
    stop_services
    log "Removendo volumes Docker..."
    docker compose down -v 2>/dev/null || true
  fi

  log "Limpando dependências e caches..."
  rm -rf node_modules .next dist build __pycache__ .venv 2>/dev/null || true

  log "Removendo .env.local..."
  rm -f .env.local 2>/dev/null || true

  ok "Ambiente limpo"
  echo ""

  # Reiniciar setup
  do_setup
}

# === Função: Setup Principal ===
do_setup() {
  log "Iniciando bootstrap de $PROJECT_SLUG..."
  echo ""

  check_prereqs || exit 1
  echo ""

  ensure_env || exit 1
  echo ""

  install_deps
  echo ""

  generate_prisma
  echo ""

  if [ "$DOCKER_ENABLED" = "true" ]; then
    start_services
    echo ""
  fi

  run_migrations
  echo ""

  check_health || exit 1
  show_summary
}

# === Entrypoint ===
cd "$(dirname "$(realpath "$0")")/.."

case "${1:-}" in
  --reset)
    do_reset
    ;;
  --health)
    check_health
    exit $?
    ;;
  --seed)
    log "Executando seeds..."
    run_seeds
    ;;
  *)
    do_setup
    ;;
esac

ok "Pronto para desenvolver! 🚀"
