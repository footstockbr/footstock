-- Migration M032: Adiciona CLUB_PARTNER ao enum AdminRole
-- Módulo: module-25-club-portal
-- Motivo: Portal exclusivo para clubes parceiros — somente leitura de métricas do próprio clube

ALTER TYPE "AdminRole" ADD VALUE 'CLUB_PARTNER';
