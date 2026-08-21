#!/bin/sh
# ============================================================================
# Watchdog de frescor do sentimento — loop de observacao
#
# Chama GET /api/cron/sentiment-staleness periodicamente.
# Nao recalcula score; apenas observa e alarma via exit code.
#
# Variaveis de ambiente:
#   WATCHDOG_TARGET_URL  — Base URL (ex.: https://www.footstock.com.br)
#   CRON_SECRET          — Segredo Bearer (mesmo do Next.js)
#   WATCHDOG_INTERVAL_S  — Intervalo em segundos (default: 60)
# ============================================================================
set -eu

TARGET="${WATCHDOG_TARGET_URL:?WATCHDOG_TARGET_URL obrigatorio}"
SECRET="${CRON_SECRET:?CRON_SECRET obrigatorio}"
INTERVAL="${WATCHDOG_INTERVAL_S:-60}"
ENDPOINT="${TARGET}/api/cron/sentiment-staleness"

echo "[watchdog-sentiment] iniciando — target=${ENDPOINT} interval=${INTERVAL}s"

while true; do
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  http_code=$(curl -s -o /tmp/wd-response.json -w "%{http_code}" \
    --max-time 30 \
    -H "Authorization: Bearer ${SECRET}" \
    "${ENDPOINT}" 2>/dev/null) || http_code="000"

  if [ "${http_code}" = "200" ]; then
    status=$(jq -r '.status // "UNKNOWN"' /tmp/wd-response.json 2>/dev/null || echo "PARSE_ERROR")
    cold=$(jq -r '.coldStart // false' /tmp/wd-response.json 2>/dev/null || echo "false")
    obsoleto=$(jq -r '.summary.OBSOLETO // 0' /tmp/wd-response.json 2>/dev/null || echo "0")
    nunca=$(jq -r '.summary.NUNCA_ESCRITO // 0' /tmp/wd-response.json 2>/dev/null || echo "0")
    fresco=$(jq -r '.summary.FRESCO // 0' /tmp/wd-response.json 2>/dev/null || echo "0")
    pausado=$(jq -r '.summary.PAUSADO // 0' /tmp/wd-response.json 2>/dev/null || echo "0")

    echo "${ts} [watchdog-sentiment] status=${status} fresco=${fresco} obsoleto=${obsoleto} pausado=${pausado} nunca_escrito=${nunca} cold_start=${cold}"

    if [ "${status}" = "DEGRADED" ] && [ "${cold}" != "true" ]; then
      echo "${ts} [watchdog-sentiment] ALERTA: sentimento obsoleto detectado (${obsoleto} ativo(s))" >&2
    fi
  elif [ "${http_code}" = "401" ]; then
    echo "${ts} [watchdog-sentiment] ERRO: 401 — CRON_SECRET invalido ou ausente" >&2
  elif [ "${http_code}" = "000" ]; then
    echo "${ts} [watchdog-sentiment] ERRO: conexao falhou (timeout ou DNS)" >&2
  else
    echo "${ts} [watchdog-sentiment] ERRO: HTTP ${http_code}" >&2
  fi

  sleep "${INTERVAL}"
done
