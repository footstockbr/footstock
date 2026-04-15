-- M039: Adiciona valor FEE ao enum FinancialType
-- Necessário para registrar transações de taxa operacional separadas da transação TRADE.
-- Rastreabilidade: T-018 (Taxa Operacional Escalonada)

ALTER TYPE "FinancialType" ADD VALUE IF NOT EXISTS 'FEE';
