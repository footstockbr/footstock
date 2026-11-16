# FootStock ops-watchdog: cron do Railway que avisa por email quando producao cai.
# Detalhes em watchdog.sh. Deploy: railway up ops-watchdog --path-as-root --service ops-watchdog
FROM alpine:3.22

RUN apk add --no-cache curl ca-certificates jq tzdata postgresql17-client

WORKDIR /app
COPY watchdog.sh ./
RUN chmod +x watchdog.sh

# Roda como root: o volume /state do Railway e montado com dono root.
CMD ["./watchdog.sh"]
