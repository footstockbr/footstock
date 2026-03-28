#!/bin/bash
# scripts/staging-validate.sh — Validação manual de staging
set -e
URL="${STAGING_URL:-http://localhost:3000}"
echo "Validando staging: $URL"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api/v1/health")
echo "Health check: HTTP $HTTP_STATUS"
[ "$HTTP_STATUS" = "200" ] || { echo "FALHOU: health check retornou $HTTP_STATUS"; exit 1; }

BODY=$(curl -s "$URL/api/v1/health")
echo "Body: $BODY"

HOME_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
echo "Homepage: HTTP $HOME_STATUS"
[ "$HOME_STATUS" != "500" ] || { echo "FALHOU: homepage 500"; exit 1; }

echo "Staging validado com sucesso"
