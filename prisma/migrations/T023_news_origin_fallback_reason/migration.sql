-- T-23: Persistir origin e fallbackReason na tabela news
-- Permite medir em SQL quanto do acervo veio de classifier_fallback.
-- Ambas nullable: linhas anteriores a esta migration ficam NULL (backfill opcional).

ALTER TABLE "news" ADD COLUMN "origin" TEXT;
ALTER TABLE "news" ADD COLUMN "fallback_reason" TEXT;
