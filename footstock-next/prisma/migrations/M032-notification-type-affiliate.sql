-- M032 — Adicionar tipos de notificação de afiliado ao enum NotificationType
-- Rastreabilidade: T-001 (Gap 7), NOTIFICATION-SPEC.md

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AFFILIATE_COMMISSION_EARNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AFFILIATE_INVITE_JOINED';
