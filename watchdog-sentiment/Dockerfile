# ============================================================================
# FootStock Watchdog Sentiment — Railway Service Config
#
# Service leve (Alpine + curl) que observa o frescor do sentimento via
# GET /api/cron/sentiment-staleness. Nao recalcula score; apenas alarma.
#
# PRIMARIO: este servico Railway (intervalo configuravel, default 60s).
# BACKUP:   GitHub Actions diario (.github/workflows/sentiment-watchdog.yml).
#
# IMPORTANTE: Configure o servico no painel Railway com:
#   Root Directory = watchdog-sentiment
#
# Variaveis de ambiente obrigatorias (painel Railway):
#   WATCHDOG_TARGET_URL  — URL completa da rota (ex.: https://www.footstock.com.br)
#   CRON_SECRET          — Segredo de autenticacao Bearer (mesmo do Next.js)
# ============================================================================

FROM alpine:3.20

RUN apk add --no-cache curl ca-certificates jq

WORKDIR /app
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Usuario nao-root (alpine: nobody:nobody)
USER nobody

# Sem EXPOSE — servico nao expoe porta (cron outbound).
ENTRYPOINT ["./entrypoint.sh"]
