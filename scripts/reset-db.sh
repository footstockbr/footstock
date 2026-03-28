#!/bin/bash
set -e

if [ "$NODE_ENV" = "production" ]; then
  echo "ERRO: reset-db.sh não pode ser executado em produção!"
  exit 1
fi

echo "⚠️  ATENÇÃO: Este script vai APAGAR todos os dados do banco de desenvolvimento."
echo "Pressione Ctrl+C para cancelar ou Enter para continuar..."
read

echo "→ Resetando banco (migrations)..."
npx prisma migrate reset --force --skip-seed

echo "→ Aplicando migrations M001-M019..."
npx prisma migrate deploy

echo "→ Executando seeds..."
npx prisma db seed

echo "✓ Banco resetado e seeds aplicados."
