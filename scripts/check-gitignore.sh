#!/usr/bin/env bash
# Valida que arquivos sensiveis nao estao sendo rastreados pelo Git
set -euo pipefail

ISSUES=0

SENSITIVE_PATTERNS=(".env" ".env.local" ".env.production" "*.pem" "*.key" "serviceAccountKey.json")

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
  TRACKED=$(git ls-files "$pattern" 2>/dev/null || true)
  if [ -n "$TRACKED" ]; then
    echo "ERRO: Arquivo sensivel rastreado pelo Git: $TRACKED"
    echo "  Remova com: git rm --cached $TRACKED"
    ISSUES=$((ISSUES + 1))
  fi
done

# Verificar que .env.example nao contem secrets reais
if [ -f .env.example ]; then
  REAL_SECRETS=$(grep -E '(sk-ant-[a-zA-Z0-9]{20,}|eyJ[A-Za-z0-9+/]{50,}=|TEST-[0-9]{15,})' .env.example 2>/dev/null \
    | grep -v "^\s*#" || true)
  if [ -n "$REAL_SECRETS" ]; then
    echo "ERRO: .env.example pode conter secrets reais:"
    echo "$REAL_SECRETS"
    ISSUES=$((ISSUES + 1))
  fi
fi

if [ "$ISSUES" -gt 0 ]; then
  echo "Falha: $ISSUES problema(s) de seguranca detectado(s)"
  exit 1
fi
echo "OK: Nenhum arquivo sensivel rastreado; .env.example limpo"
