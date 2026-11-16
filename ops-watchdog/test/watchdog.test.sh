#!/bin/sh
# Testes do ops-watchdog com curl/psql falsos no PATH. Uso: sh ops-watchdog/test/watchdog.test.sh
# Requer jq. Roda em dash/busybox sh para pegar bashismo.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/../watchdog.sh"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/state"

# curl falso: decide pela URL; grava o payload do Resend em $T/mails
cat >"$T/bin/curl" <<'EOF'
#!/bin/sh
out=""; url=""; data=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out=$2; shift ;;
    --data-binary) data=${2#@}; shift ;;
    -w|--max-time|-X|-H) shift ;;
    http*) url=$1 ;;
  esac
  shift
done
case "$url" in
  *health*) code=$FAKE_WEB_CODE; body=$FAKE_WEB_BODY ;;
  *ready*) code=$FAKE_MOTOR_CODE; body='{"status":"x"}' ;;
  *resend*) code=$FAKE_RESEND_CODE; body='{"id":"1"}'
            if [ "$code" = 200 ]; then jq -c . "$data" >>"$FAKE_DIR/mails"; fi ;;
esac
[ "$code" = 000 ] && { echo "curl: (28) timeout" >&2; exit 28; }
printf '%s' "$body" >"$out"
printf '%s' "$code"
EOF
cat >"$T/bin/psql" <<'EOF'
#!/bin/sh
[ "$FAKE_PSQL_EXIT" = 0 ] || { echo "psql: error: connection refused" >&2; exit 2; }
echo "$FAKE_PSQL_OUT"
EOF
chmod +x "$T/bin/curl" "$T/bin/psql"

export PATH="$T/bin:$PATH" FAKE_DIR="$T" STATE_DIR="$T/state"
export DATABASE_URL=postgres://x RESEND_API_KEY=re_test RESEND_FROM_EMAIL=noreply@x.test ALERT_EMAIL_TO="a@x.test, b@x.test"
export RESEND_API_URL=https://api.resend.test/emails

ok_all() {
  FAKE_WEB_CODE=200; FAKE_WEB_BODY='{"status":"ok"}'; FAKE_MOTOR_CODE=200
  FAKE_PSQL_EXIT=0; FAKE_PSQL_OUT='4|300|80'; FAKE_RESEND_CODE=200
  export FAKE_WEB_CODE FAKE_WEB_BODY FAKE_MOTOR_CODE FAKE_PSQL_EXIT FAKE_PSQL_OUT FAKE_RESEND_CODE
}
NOW=1000000
run() { NOW=$((NOW + 300)); WATCHDOG_NOW=$NOW sh "$SCRIPT" >"$T/log" 2>&1; RC=$?; }
mails() { if [ -f "$T/mails" ]; then grep -c '"subject"' "$T/mails"; else echo 0; fi; }
last_subject() { tail -n 1 "$T/mails" | jq -r '.subject'; }
reset() { rm -rf "$T/state"/* "$T/mails"; ok_all; }

PASS=0; FAIL=0
check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); echo "FALHOU: $1 (esperado '$3', veio '$2')"; cat "$T/log"; fi
}

# 1. tudo ok: sem email, exit 0
reset; run
check "tudo ok sem email" "$(mails)" 0
check "tudo ok exit 0" "$RC" 0

# 2. motor: 1 falha nao alerta, 2a alerta, repete so apos 2h, recupera
reset; FAKE_MOTOR_CODE=503; run
check "1a falha nao alerta" "$(mails)" 0
run
check "2a falha alerta" "$(mails)" 1
check "assunto do alerta" "$(last_subject)" "[FootStock] ALERTA producao: motor"
check "destinatarios separados" "$(tail -n 1 "$T/mails" | jq -c '.to')" '["a@x.test","b@x.test"]'
run; run; run
check "dentro de 2h nao repete" "$(mails)" 1
i=0; while [ $i -lt 21 ]; do run; i=$((i + 1)); done
check "repete apos 2h" "$(mails)" 2
grep -q 'AINDA EM FALHA' "$T/mails"; check "texto de repeticao" $? 0
FAKE_MOTOR_CODE=200; run
check "recuperacao manda email" "$(mails)" 3
check "assunto recuperacao" "$(last_subject)" "[FootStock] RECUPERADO: motor"
run
check "depois de recuperado fica quieto" "$(mails)" 3

# 3. falha isolada (deploy) nao gera alerta nem recuperacao
reset; FAKE_MOTOR_CODE=000; run; FAKE_MOTOR_CODE=200; run
check "blip isolado silencioso" "$(mails)" 0

# 4. banco fora: so db alerta; ticks/disk ficam skip
reset; FAKE_PSQL_EXIT=2; run; run
check "db fora alerta" "$(last_subject)" "[FootStock] ALERTA producao: db"
grep -q 'connection refused' "$T/mails"; check "detalhe do psql" $? 0

# 4b. saida nao inteira do psql (bug do 1o deploy: aritmetica abortava o script)
reset; FAKE_PSQL_OUT='4|300.5|80'; run; run
check "saida decimal nao derruba" "$RC" 0
check "saida decimal alerta db" "$(last_subject)" "[FootStock] ALERTA producao: db"
grep -q 'saida inesperada' "$T/mails"; check "detalhe da saida inesperada" $? 0

# 5. disco: 80% -> warn, 95% -> crit
reset; FAKE_PSQL_OUT='4|37000|302'; run; run
check "disco 80% avisa" "$(last_subject)" "[FootStock] ALERTA producao: disk_warn"
FAKE_PSQL_OUT='4|44000|300'; run; run
check "disco 95% critico" "$(last_subject)" "[FootStock] ALERTA producao: disk_crit"

# 6. ticks parados e sem nenhum tick
reset; FAKE_PSQL_OUT='900|300|80'; run; run
check "ticks parados" "$(last_subject)" "[FootStock] ALERTA producao: ticks"
reset; FAKE_PSQL_OUT='-1|300|80'; run; run
check "sem ticks" "$(last_subject)" "[FootStock] ALERTA producao: ticks"

# 7. web 503 com corpo e web 200 degradado
reset; FAKE_WEB_CODE=503; FAKE_WEB_BODY='{"status":"error","checks":{"database":"error"}}'; run; run
check "web 503 alerta" "$(last_subject)" "[FootStock] ALERTA producao: web"
reset; FAKE_WEB_BODY='{"status":"degraded"}'; run; run
check "web degradado alerta" "$(last_subject)" "[FootStock] ALERTA producao: web"

# 8. Resend fora: nao marca enviado, tenta de novo na rodada seguinte
reset; FAKE_MOTOR_CODE=503; FAKE_RESEND_CODE=500; run; run
check "envio falho exit 1" "$RC" 1
check "nada entregue" "$(mails)" 0
FAKE_RESEND_CODE=200; run
check "reenvia na proxima rodada" "$(mails)" 1

# 9. alerta + recuperacao na mesma rodada
reset; FAKE_MOTOR_CODE=503; run; FAKE_WEB_CODE=503; run; FAKE_MOTOR_CODE=200; run
check "alerta com recuperacao" "$(last_subject)" "[FootStock] ALERTA producao: web (+ recuperacao)"

[ -n "${SHOW_MAIL:-}" ] && tail -n 1 "$T/mails" | jq -r .subject,.text

# 10. configuracao faltando
reset; ALERT_EMAIL_TO= run
check "config faltando exit 2" "$RC" 2

echo "ops-watchdog: $PASS ok, $FAIL falha(s)"
[ "$FAIL" -eq 0 ]
