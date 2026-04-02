#!/usr/bin/env bash
# Valida que todas as process.env e NEXT_PUBLIC_ no código estão documentadas em .env.example
set -euo pipefail

MISSING=0
ENV_FILE=".env.example"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: $ENV_FILE não encontrado"
  exit 1
fi

# Extrair variáveis referenciadas no código (app/, lib/, src/, motor/)
CODE_VARS=$(grep -roh \
  "process\.env\.\([A-Z_0-9]\+\)\|NEXT_PUBLIC_[A-Z_0-9]\+" \
  app/ lib/ src/ motor/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null \
  | sed 's/process\.env\.//' | sort -u || true)

for var in $CODE_VARS; do
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
