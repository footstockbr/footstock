#!/bin/sh
# ============================================================================
# FootStock ops-watchdog
#
# Roda como cron do Railway (a cada 5 min, ver railway.toml) e AVISA POR EMAIL
# quando producao cai. Existe porque em 2026-10-29 o disco do Postgres encheu,
# a API ficou 503 por 18 dias e ninguem soube: os watchdogs anteriores so
# escreviam log.
#
# Checagens (chave -> condicao de falha):
#   web        GET $WEB_HEALTH_URL nao responde 200 com {"status":"ok"}
#   motor      GET $MOTOR_READY_URL nao responde 200 (motor sem lider/engine)
#   db         psql no $DATABASE_URL falha (banco fora ou recusando conexao)
#   ticks      ultimo price_history dos ativos ativos tem mais de $TICK_STALE_S s
#              (o motor persiste A_TOP a cada tick, 24h, independente da sessao)
#   disk_warn  bancos + WAL >= $DISK_WARN_PCT % de $DISK_CAPACITY_MB
#   disk_crit  bancos + WAL >= $DISK_CRIT_PCT % de $DISK_CAPACITY_MB
#
# Disciplina de alerta (estado em $STATE_DIR, um arquivo por chave):
#   - so alerta depois de $FAILS_BEFORE_ALERT falhas seguidas (deploy do motor
#     derruba /ready por ~1 min e nao deve gerar email);
#   - repete o alerta a cada $REPEAT_EVERY_S enquanto a falha durar;
#   - manda RECUPERADO quando uma chave que ja alertou volta ao normal;
#   - se o envio falhar, nada e marcado como enviado: a proxima rodada tenta de novo.
#   Com o banco fora, ticks/disk ficam sem medicao (skip) e so "db" alerta.
#
# Variaveis obrigatorias: DATABASE_URL, RESEND_API_KEY, RESEND_FROM_EMAIL,
# ALERT_EMAIL_TO (lista separada por virgula).
# ============================================================================

set -u

STATE_DIR=${STATE_DIR:-/state}
WEB_HEALTH_URL=${WEB_HEALTH_URL:-https://www.footstock.com.br/api/health}
MOTOR_READY_URL=${MOTOR_READY_URL:-https://api.footstock.com.br/ready}
TICK_STALE_S=${TICK_STALE_S:-300}
DISK_CAPACITY_MB=${DISK_CAPACITY_MB:-46627}
DISK_WARN_PCT=${DISK_WARN_PCT:-75}
DISK_CRIT_PCT=${DISK_CRIT_PCT:-90}
FAILS_BEFORE_ALERT=${FAILS_BEFORE_ALERT:-2}
REPEAT_EVERY_S=${REPEAT_EVERY_S:-7200}
HTTP_TIMEOUT_S=${HTTP_TIMEOUT_S:-20}
RESEND_API_URL=${RESEND_API_URL:-https://api.resend.com/emails}
NOW=${WATCHDOG_NOW:-$(date +%s)}

log() { echo "[ops-watchdog] $*"; }

missing=""
for v in DATABASE_URL RESEND_API_KEY RESEND_FROM_EMAIL ALERT_EMAIL_TO; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || missing="$missing $v"
done
if [ -n "$missing" ]; then
  log "ERRO de configuracao: faltando$missing"
  exit 2
fi
ALERT_FROM=${ALERT_FROM:-FootStock Ops <$RESEND_FROM_EMAIL>}

if ! mkdir -p "$STATE_DIR" 2>/dev/null || ! [ -w "$STATE_DIR" ]; then
  log "AVISO: $STATE_DIR sem escrita, usando /tmp (sem deduplicacao entre rodadas)"
  STATE_DIR=/tmp/ops-watchdog-state
  mkdir -p "$STATE_DIR"
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
RESULTS="$WORK/results"
: >"$RESULTS"

# record <chave> <ok|fail|skip> <detalhe>
record() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >>"$RESULTS"; }

fmt_time() { TZ=${ALERT_TZ:-America/Sao_Paulo} date -d "@$1" '+%d/%m %H:%M' 2>/dev/null || echo "@$1"; }

fmt_dur() {
  s=$1
  if [ "$s" -ge 3600 ]; then echo "$((s / 3600))h$(((s % 3600) / 60))min"
  else echo "$((s / 60))min"; fi
}

# ---------------------------------------------------------------- web
code=$(curl -sS -o "$WORK/web" -w '%{http_code}' --max-time "$HTTP_TIMEOUT_S" "$WEB_HEALTH_URL" 2>"$WORK/web.err") || code=000
status=$(jq -r '.status // empty' "$WORK/web" 2>/dev/null)
if [ "$code" = 200 ] && [ "$status" = ok ]; then
  record web ok "HTTP 200"
else
  detail=$(head -c 300 "$WORK/web" 2>/dev/null | tr '\n' ' ')
  [ -n "$detail" ] || detail=$(head -c 200 "$WORK/web.err" | tr '\n' ' ')
  record web fail "$WEB_HEALTH_URL -> HTTP $code $detail"
fi

# ---------------------------------------------------------------- motor
code=$(curl -sS -o "$WORK/motor" -w '%{http_code}' --max-time "$HTTP_TIMEOUT_S" "$MOTOR_READY_URL" 2>"$WORK/motor.err") || code=000
if [ "$code" = 200 ]; then
  record motor ok "HTTP 200"
else
  detail=$(head -c 300 "$WORK/motor" 2>/dev/null | tr '\n' ' ')
  [ -n "$detail" ] || detail=$(head -c 200 "$WORK/motor.err" | tr '\n' ' ')
  record motor fail "$MOTOR_READY_URL -> HTTP $code $detail"
fi

# ---------------------------------------------------------------- db, ticks, disk
SQL="select
  coalesce((select extract(epoch from (now() at time zone 'utc') - max(x.t))::bigint
     from assets a cross join lateral (
       select p.timestamp t from price_history p where p.asset_id = a.id
       order by p.timestamp desc limit 1) x
     where a.is_active), -1),
  (select sum(pg_database_size(datname)) from pg_database) / 1048576,
  (select coalesce(sum(size), 0) from pg_ls_waldir()) / 1048576"

if out=$(PGCONNECT_TIMEOUT=10 PGOPTIONS='-c statement_timeout=20000' \
    psql "$DATABASE_URL" -XAtq -F '|' -v ON_ERROR_STOP=1 -c "$SQL" 2>"$WORK/psql.err"); then
  record db ok "conectado"
  tick_age=$(echo "$out" | cut -d'|' -f1)
  db_mb=$(echo "$out" | cut -d'|' -f2)
  wal_mb=$(echo "$out" | cut -d'|' -f3)

  if [ "$tick_age" -lt 0 ]; then
    record ticks fail "nenhum price_history para ativos ativos"
  elif [ "$tick_age" -gt "$TICK_STALE_S" ]; then
    record ticks fail "ultimo tick persistido ha $(fmt_dur "$tick_age") (limite ${TICK_STALE_S}s)"
  else
    record ticks ok "ultimo tick ha ${tick_age}s"
  fi

  used_mb=$((db_mb + wal_mb))
  pct=$((used_mb * 100 / DISK_CAPACITY_MB))
  disk_detail="${pct}% do volume (bancos ${db_mb} MB + WAL ${wal_mb} MB de ${DISK_CAPACITY_MB} MB)"
  if [ "$pct" -ge "$DISK_WARN_PCT" ]; then record disk_warn fail "$disk_detail"; else record disk_warn ok "$disk_detail"; fi
  if [ "$pct" -ge "$DISK_CRIT_PCT" ]; then record disk_crit fail "$disk_detail"; else record disk_crit ok "$disk_detail"; fi
else
  record db fail "psql falhou: $(head -c 300 "$WORK/psql.err" | tr '\n' ' ')"
  record ticks skip "sem banco"
  record disk_warn skip "sem banco"
  record disk_crit skip "sem banco"
fi

# ---------------------------------------------------------------- decisao
# Estado por chave: "<falhas_seguidas> <inicio_da_falha> <ultimo_envio>" (ultimo_envio=0: nunca alertou)
ALERTS="$WORK/alerts"; RECOVERIES="$WORK/recoveries"; PENDING="$WORK/pending"
: >"$ALERTS"; : >"$RECOVERIES"; : >"$PENDING"

while IFS="$(printf '\t')" read -r key st detail; do
  file="$STATE_DIR/$key"
  fails=0; since=0; sent=0
  [ -f "$file" ] && read -r fails since sent <"$file"
  case "$st" in
    skip) ;;
    ok)
      if [ "$sent" -gt 0 ]; then
        echo "- $key: normal de novo. Fora desde $(fmt_time "$since") ($(fmt_dur $((NOW - since)))). $detail" >>"$RECOVERIES"
        echo "rm $key" >>"$PENDING"   # so apaga se o RECUPERADO for entregue
      else
        rm -f "$file"
      fi
      ;;
    fail)
      fails=$((fails + 1))
      [ "$since" -gt 0 ] || since=$NOW
      echo "$fails $since $sent" >"$file"
      if [ "$fails" -ge "$FAILS_BEFORE_ALERT" ] && { [ "$sent" -eq 0 ] || [ $((NOW - sent)) -ge "$REPEAT_EVERY_S" ]; }; then
        if [ "$sent" -eq 0 ]; then tag="FALHA"; else tag="AINDA EM FALHA"; fi
        echo "- $key [$tag desde $(fmt_time "$since"), $(fmt_dur $((NOW - since)))]: $detail" >>"$ALERTS"
        echo "sent $key $fails $since" >>"$PENDING"
      fi
      ;;
  esac
done <"$RESULTS"

summary=$(awk -F '\t' '{printf "%s=%s ", $1, $2}' "$RESULTS")

if ! [ -s "$ALERTS" ] && ! [ -s "$RECOVERIES" ]; then
  log "rodada ok, sem email: $summary"
  exit 0
fi

# ---------------------------------------------------------------- email
if [ -s "$ALERTS" ]; then
  keys=$(sed -n 's/^- \([a-z_]*\).*/\1/p' "$ALERTS" | tr '\n' ' ' | sed 's/ $//')
  subject="[FootStock] ALERTA producao: $keys"
  [ -s "$RECOVERIES" ] && subject="$subject (+ recuperacao)"
else
  keys=$(sed -n 's/^- \([a-z_]*\).*/\1/p' "$RECOVERIES" | tr '\n' ' ' | sed 's/ $//')
  subject="[FootStock] RECUPERADO: $keys"
fi

{
  echo "ops-watchdog, rodada de $(fmt_time "$NOW") (horario de Brasilia)."
  if [ -s "$ALERTS" ]; then echo; echo "EM FALHA:"; cat "$ALERTS"; fi
  if [ -s "$RECOVERIES" ]; then echo; echo "RECUPERADO:"; cat "$RECOVERIES"; fi
  echo
  echo "Todas as checagens desta rodada:"
  awk -F '\t' '{printf "  %s: %s (%s)\n", $1, $2, $3}' "$RESULTS"
  echo
  echo "Alerta repete a cada $(fmt_dur "$REPEAT_EVERY_S") enquanto a falha durar."
  echo "Railway: https://railway.com/project/${RAILWAY_PROJECT_ID:-45677912-3487-4978-b20b-fc7cdb8b93cf}"
} >"$WORK/body"

jq -n --arg from "$ALERT_FROM" --arg to "$ALERT_EMAIL_TO" --arg subject "$subject" \
  --rawfile text "$WORK/body" \
  '{from: $from, to: ($to | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))), subject: $subject, text: $text}' \
  >"$WORK/payload.json"

code=$(curl -sS -o "$WORK/resend" -w '%{http_code}' --max-time "$HTTP_TIMEOUT_S" -X POST "$RESEND_API_URL" \
  -H "Authorization: Bearer $RESEND_API_KEY" -H 'Content-Type: application/json' \
  --data-binary "@$WORK/payload.json" 2>"$WORK/resend.err") || code=000

case "$code" in
  2??)
    while read -r action key fails since; do
      case "$action" in
        rm) rm -f "$STATE_DIR/$key" ;;
        sent) echo "$fails $since $NOW" >"$STATE_DIR/$key" ;;
      esac
    done <"$PENDING"
    log "EMAIL ENVIADO para $ALERT_EMAIL_TO: $subject | $summary"
    ;;
  *)
    log "ERRO ao enviar email (HTTP $code): $(cat "$WORK/resend" "$WORK/resend.err" 2>/dev/null | head -c 300 | tr '\n' ' ') | $summary"
    log "conteudo nao entregue: $subject"
    exit 1
    ;;
esac
