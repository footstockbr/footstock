#!/usr/bin/env bash
# Valida que todas as process.env e NEXT_PUBLIC_ no código estão documentadas em .env.example
set -euo pipefail

MISSING=0
ENV_FILE=".env.example"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: $ENV_FILE não encontrado"
  exit 1
fi

# Diretórios reais com código de aplicação (monorepo: motor + footstock-next).
# Exclui node_modules, dist, .next, build, coverage para não pegar lixo de
# tooling (Babel, Browserslist, Chokidar) compilado em dependências.
SCAN_DIRS=()
for d in motor/src footstock-next/app footstock-next/lib footstock-next/src; do
  [ -d "$d" ] && SCAN_DIRS+=("$d")
done

if [ ${#SCAN_DIRS[@]} -eq 0 ]; then
  echo "ERRO: nenhum diretório de código encontrado para escanear"
  exit 1
fi

# Variáveis injetadas pela plataforma/runtime — não precisam estar em .env.example
# (NEXT_PHASE é setado pelo Next.js durante build/dev; PORT e RAILWAY_REPLICA_ID
# são injetados pelo Railway no container em runtime).
IGNORED_VARS=" NEXT_PHASE PORT RAILWAY_REPLICA_ID "

CODE_VARS=$(grep -roh \
  "process\.env\.\([A-Z_0-9]\+\)\|NEXT_PUBLIC_[A-Z_0-9]\+" \
  "${SCAN_DIRS[@]}" \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next \
  --exclude-dir=build --exclude-dir=coverage \
  2>/dev/null \
  | sed 's/process\.env\.//' | sort -u || true)

for var in $CODE_VARS; do
  case "$IGNORED_VARS" in *" $var "*) continue ;; esac
  if ! grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
    echo "MISSING: $var não está em $ENV_FILE"
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -gt 0 ]; then
  echo "Erro: $MISSING variável(is) de ambiente sem documentação em $ENV_FILE"
  exit 1
fi
echo "OK: Todas as variáveis de ambiente estão documentadas em $ENV_FILE"
