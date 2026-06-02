# Makefile — Targets de desenvolvimento
# Gerado por /dev-bootstrap-create (SystemForge)

.PHONY: help setup reset health dev test dev-server docker-up docker-down docker-clean seed lint format typecheck all

help:
	@echo "FootStock — Targets de Desenvolvimento"
	@echo "========================================"
	@echo ""
	@echo "  make setup              — Setup completo do ambiente (instala deps, migrations, seeds)"
	@echo "  make reset              — Reset completo (remove tudo e refaz setup)"
	@echo "  make health             — Verifica saúde do ambiente"
	@echo ""
	@echo "  make dev                — Inicia servidor de desenvolvimento"
	@echo "  make test               — Executa testes (Jest)"
	@echo "  make test:watch         — Testes em modo watch"
	@echo "  make test:all           — Testes + testes de integração"
	@echo ""
	@echo "  make lint               — Verifica style (ESLint)"
	@echo "  make lint:fix           — Corrige style issues"
	@echo "  make format             — Formata código (Prettier)"
	@echo "  make format:check       — Verifica formatação"
	@echo "  make typecheck          — Verifica tipos (TypeScript)"
	@echo ""
	@echo "  make docker-up          — Sobe serviços Docker"
	@echo "  make docker-down        — Para serviços Docker"
	@echo "  make docker-clean       — Remove containers e volumes"
	@echo ""
	@echo "  make seed               — Executa seeds do banco"
	@echo "  make migrate            — Executa migrations"
	@echo ""
	@echo "  make all                — Build + Lint + Test (pre-deploy checks)"

# === Bootstrap ===
setup:
	@./scripts/bootstrap.sh

reset:
	@./scripts/bootstrap.sh --reset

health:
	@./scripts/bootstrap.sh --health

# === Desenvolvimento ===
dev:
	npm run dev

test:
	npm run test

test:watch:
	npm run test:watch

test:coverage:
	npm run test:coverage

test:all:
	npm run test:all

# === Code Quality ===
lint:
	npm run lint

lint:fix:
	npm run lint:fix

format:
	npm run format

format:check:
	npm run format:check

typecheck:
	npm run typecheck

# === Docker ===
docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-clean:
	docker compose down -v

# === Database ===
seed:
	npm run db:seed

migrate:
	npx prisma migrate deploy

# === Build & CI ===
build:
	npm run build

all: lint typecheck test build
	@echo "✓ Todos os checks passaram"

.DEFAULT_GOAL := help
