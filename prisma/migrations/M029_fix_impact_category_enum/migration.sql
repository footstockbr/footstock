-- M029: Corrigir ImpactCategory enum — 6 categorias INTAKE canônicas
-- Substitui POSITIVE/NEGATIVE/NEUTRAL por categorias com magnitude definida

-- Criar novo enum
CREATE TYPE "ImpactCategory_new" AS ENUM (
  'FINANCEIRA_CRITICA',
  'ESPORTIVA_MAJORITARIA',
  'MERCADO_ATIVOS',
  'INTEGRIDADE_SAUDE',
  'INSTITUCIONAL',
  'ESPORTIVA_MENOR'
);

-- Migrar dados existentes (mapear valores antigos para os novos)
ALTER TABLE "news" ALTER COLUMN "impact" TYPE text;
UPDATE "news" SET "impact" = CASE
  WHEN "impact" = 'POSITIVE' THEN 'ESPORTIVA_MAJORITARIA'
  WHEN "impact" = 'NEGATIVE' THEN 'ESPORTIVA_MAJORITARIA'
  WHEN "impact" = 'NEUTRAL' THEN 'INSTITUCIONAL'
  ELSE 'INSTITUCIONAL'
END;

-- Dropar enum antigo e renomear
DROP TYPE "ImpactCategory";
ALTER TYPE "ImpactCategory_new" RENAME TO "ImpactCategory";
ALTER TABLE "news" ALTER COLUMN "impact" TYPE "ImpactCategory" USING "impact"::"ImpactCategory";
