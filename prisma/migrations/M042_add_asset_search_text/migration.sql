-- ============================================================================
-- M042 — Adicionar coluna search_text nos ativos
--
-- Propósito: mecanismo INTERNO de busca por nome real de clube.
-- A coluna contém aliases em minúsculas (nomes reais, apelidos, siglas)
-- usados APENAS no filtro server-side de GET /api/v1/assets?search=...
-- NUNCA deve ser retornada ao cliente nem exposta em nenhuma response.
--
-- Exemplo: pesquisar "Flamengo" → retorna o ativo URU3 (Urubu da Gávea FC).
-- ============================================================================

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "search_text" TEXT NOT NULL DEFAULT '';

-- Índice trigram para ILIKE eficiente (requer extensão pg_trgm, habilitada
-- por padrão no Supabase)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "assets_search_text_trgm_idx"
  ON "assets" USING GIN ("search_text" gin_trgm_ops);

-- ─── Popula aliases por ticker (Série A) ─────────────────────────────────────

UPDATE "assets" SET "search_text" = 'flamengo fla mengao mengão urubu nacao nação gavea gávea' WHERE ticker = 'URU3';
UPDATE "assets" SET "search_text" = 'palmeiras pal porco verdao verdão palestra alviverde parque' WHERE ticker = 'POR4';
UPDATE "assets" SET "search_text" = 'corinthians cor timao timão coringao coringão alvinegro paulistano sao jorge' WHERE ticker = 'TIM3';
UPDATE "assets" SET "search_text" = 'sao paulo são paulo spfc soberano tricolor paulistano morumbi' WHERE ticker = 'TRI4';
UPDATE "assets" SET "search_text" = 'atletico mineiro atlético mineiro galo cam atletico atlético galo doido lagoinha belo horizonte' WHERE ticker = 'GAL3';
UPDATE "assets" SET "search_text" = 'botafogo fogao fogão bot estrela solitaria solitária general severiano manequinho' WHERE ticker = 'FOG3';
UPDATE "assets" SET "search_text" = 'internacional inter colorado int beira-rio beira rio porto alegre' WHERE ticker = 'COL3';
UPDATE "assets" SET "search_text" = 'gremio grêmio gre imortal tricolor gaucho gaúcho arena gremio grêmio porto alegre' WHERE ticker = 'IMO3';
UPDATE "assets" SET "search_text" = 'cruzeiro raposa cru celeste mineirao mineirão belo horizonte' WHERE ticker = 'RAP3';
UPDATE "assets" SET "search_text" = 'vasco vasco da gama vas cruz de malta gigante da colina sao januario são januário rio de janeiro' WHERE ticker = 'MAL4';
UPDATE "assets" SET "search_text" = 'bahia bah tricolor baiano esquadrao esquadrão fonte nova salvador' WHERE ticker = 'TRI3';
UPDATE "assets" SET "search_text" = 'fluminense flu tricolor das laranjeiras laranjeiras nec guerreiro rio de janeiro' WHERE ticker = 'GUE4';
UPDATE "assets" SET "search_text" = 'bragantino red bull bragantino rb bragantino brg massa bruta nabi abi chedid braganca paulista' WHERE ticker = 'TOR3';
UPDATE "assets" SET "search_text" = 'mirassol mir leaozinho leãozinho maiao maião interior paulista' WHERE ticker = 'LEM3';
UPDATE "assets" SET "search_text" = 'santos san peixe baleia vila belmiro litoral paulista' WHERE ticker = 'BAL4';
UPDATE "assets" SET "search_text" = 'athletico paranaense athletico atletico paranaense atlético cap furacao furacão huracán capao da imbuia capão liga curitiba' WHERE ticker = 'FUR3';
UPDATE "assets" SET "search_text" = 'coritiba coxa cfc vovo vovô couto couto pereira curitiba verde branco' WHERE ticker = 'VOA4';
UPDATE "assets" SET "search_text" = 'chapecoense chape cha conda arena conda arena condá chapeco chapecó' WHERE ticker = 'CON3';
UPDATE "assets" SET "search_text" = 'remo rem leao azul leão azul baenao baenão belem belém para pará' WHERE ticker = 'LEA3';
UPDATE "assets" SET "search_text" = 'vitoria vitória vit leao da barra leão da barra barradao barradão salvador bahia' WHERE ticker = 'LEB3';

-- ─── Popula aliases por ticker (Série B) ─────────────────────────────────────

UPDATE "assets" SET "search_text" = 'america mineiro américa mineiro coelho ame america-mg independencia independência belo horizonte' WHERE ticker = 'COE3';
UPDATE "assets" SET "search_text" = 'atletico goianiense atlético goianiense acg dragao goianiense dragão goiano cavalo goiania goiânia' WHERE ticker = 'CAV4';
UPDATE "assets" SET "search_text" = 'goias goiás goi esmeraldino serrinha goiania goiânia' WHERE ticker = 'DRA3';
UPDATE "assets" SET "search_text" = 'avai avaí ava leao da ilha leão da ilha ressacada florianopolis florianópolis' WHERE ticker = 'LEI4';
UPDATE "assets" SET "search_text" = 'botafogo-sp botafogo sp botafogo ribeirao preto ribeirão btc pantera mogiana santa cruz botafogo' WHERE ticker = 'PAN3';
UPDATE "assets" SET "search_text" = 'ceara ceará cec vovo do castelao vovô do castelão vozao vozão castelão fortaleza' WHERE ticker = 'VOZ3';
UPDATE "assets" SET "search_text" = 'crb clube de regatas brasil galo do crb pajucara pajuçara alagoas maceio maceió' WHERE ticker = 'GAP3';
UPDATE "assets" SET "search_text" = 'criciuma criciúma criciumense tigre criciumense heriberto hulse hülse santa catarina' WHERE ticker = 'TIG4';
UPDATE "assets" SET "search_text" = 'cuiaba cuiabá cui dourado pantanal arena pantanal mato grosso' WHERE ticker = 'DOU4';
UPDATE "assets" SET "search_text" = 'fortaleza fore leao do pici leão do pici pici castelão ceara ceará nordeste' WHERE ticker = 'LEP4';
UPDATE "assets" SET "search_text" = 'guarani guarany tubarao tubarão bugre brinco de ouro campinas sao paulo' WHERE ticker = 'TUB3';
UPDATE "assets" SET "search_text" = 'nautico náutico nau timbu aflitos recife pernambuco' WHERE ticker = 'NAF3';
UPDATE "assets" SET "search_text" = 'novorizontino novo nov ntl tigre do vale vale do peixe jorge ismael de birigui interior paulista' WHERE ticker = 'TIV3';
UPDATE "assets" SET "search_text" = 'operario operário ope fantasma campos gerais germanico germânico ponta grossa parana paraná' WHERE ticker = 'FAS3';
UPDATE "assets" SET "search_text" = 'ponte preta pon macaca majestoso moises lucarelli campinas sao paulo' WHERE ticker = 'MAC4';
UPDATE "assets" SET "search_text" = 'sao bernardo são bernardo sbr tigre abc grande abc primeiro de maio santo andre' WHERE ticker = 'ABT4';
UPDATE "assets" SET "search_text" = 'sport sport recife spt leao da ilha do retiro leão recife pernambuco' WHERE ticker = 'LEI3';
UPDATE "assets" SET "search_text" = 'vila nova pmb tigre goiano onofre lopes serra dourada goiania goiânia goias' WHERE ticker = 'TIS3';
UPDATE "assets" SET "search_text" = 'juventude juv indio índio serra gaucha gaúcha caxias do sul alfredo jaconi rio grande do sul' WHERE ticker = 'IND4';
UPDATE "assets" SET "search_text" = 'coritiba cearense cgc periquito serrana guarani-ce ceara nordeste' WHERE ticker = 'PER3';

-- down: ALTER TABLE "assets" DROP COLUMN IF EXISTS "search_text";
--       DROP INDEX IF EXISTS "assets_search_text_trgm_idx";
