-- Migration M030: Adiciona CLOSING_CALL ao enum SessionType
-- Necessário para persistência correta do período de leilão de fechamento (00:45–01:00 BRT)
-- que tem volatilidade 1.5x (maior que TRADING) — distinto do REGULAR.

ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'CLOSING_CALL' AFTER 'REGULAR';
