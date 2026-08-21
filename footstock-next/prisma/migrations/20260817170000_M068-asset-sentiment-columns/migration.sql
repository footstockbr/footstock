-- M068: adiciona colunas de sentimento estruturado na tabela assets.
-- Colunas nullable para nao quebrar dados existentes.
-- sentiment_score: score numerico de confianca (-1.0 a 1.0, precisao 4 casas decimais).
-- sentiment_reason: justificativa textual do classificador LLM.
-- sentiment_components: JSON com breakdown por fator (news, technical, social, etc).
-- sentiment_updated_at: ultimo timestamp em que o sentimento foi recalculado.
-- sentiment_last_flip_at: timestamp da ultima mudanca de rotulo (BULLISH/BEARISH/NEUTRAL).

ALTER TABLE "assets" ADD COLUMN "sentiment_score" DECIMAL(6,4);
ALTER TABLE "assets" ADD COLUMN "sentiment_reason" TEXT;
ALTER TABLE "assets" ADD COLUMN "sentiment_components" JSONB;
ALTER TABLE "assets" ADD COLUMN "sentiment_updated_at" TIMESTAMPTZ;
ALTER TABLE "assets" ADD COLUMN "sentiment_last_flip_at" TIMESTAMPTZ;
