#!/bin/bash
set -e

echo "=== FootStock — Demo Milestone 7 ==="
echo ""

# Verificar .env
if [ ! -f ".env" ]; then
  echo "❌ Arquivo .env não encontrado. Configure DATABASE_URL e DIRECT_URL antes de continuar."
  exit 1
fi

echo "Aplicando migrations..."
npx prisma migrate deploy

echo ""
echo "Executando seed de demonstração..."
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-milestone-7.ts

echo ""
echo "=== Setup Concluído! ==="
echo ""
echo "Usuários de demo:"
echo "  Jogador: demo@jogador.footstock / Demo@123"
echo "  Craque:  demo@craque.footstock  / Demo@123"
echo "  Lenda:   demo@lenda.footstock   / Demo@123"
echo ""
echo "O que verificar:"
echo "  /forum     → 5 posts com likes e conteúdo variado"
echo "  /ligas     → 'Liga Demo — Semana 5' ativa com ranking"
echo "  sino/badge → 1-2 não-lidas (LEAGUE_RESULT + NEWS_FAVORITE_CLUB para Lenda)"
echo ""
echo "Verificação rápida via API:"
echo "  curl -H 'Authorization: Bearer \$DEMO_JWT' http://localhost:3000/api/v1/notifications/unread-count"
echo "  curl -H 'Authorization: Bearer \$DEMO_JWT' http://localhost:3000/api/v1/notifications"
