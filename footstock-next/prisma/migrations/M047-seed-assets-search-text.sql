-- ============================================================================
-- M047 — Popular search_text dos ativos com aliases de busca
-- Objetivo: permitir que o admin busque clubes pelo nome real, apelido,
-- sigla ou variacao de grafia no campo "Time Real Vinculado" do modal.
-- Regras:
-- - Sem acentos (index GIN trgm funciona melhor normalizado)
-- - Tudo lowercase
-- - Aliases separados por virgula
-- - Idempotente (UPDATE nao falha se ja existir valor)
-- ============================================================================

-- Serie A
UPDATE "assets" SET "search_text" = 'santos, peixe, santistas, alvinegro praiano, santos fc, vila belmiro, meninos da vila' WHERE ticker = 'BAL4';
UPDATE "assets" SET "search_text" = 'internacional, inter, colorado, inter de porto alegre, scr internacional, colorado gaucho' WHERE ticker = 'COL3';
UPDATE "assets" SET "search_text" = 'botafogo, fogao, estrela solitaria, manequinho, botafogo rj, botafogo de futebol e regatas, glorioso' WHERE ticker = 'FOG3';
UPDATE "assets" SET "search_text" = 'athletico-pr, athletico paranaense, furacao, cap, athletic club, atletico paranaense, athletico curitibano' WHERE ticker = 'FUR3';
UPDATE "assets" SET "search_text" = 'atletico-mg, atletico mineiro, galo, alvinegro, galao, atletico bh, galo doido, mineiro' WHERE ticker = 'GAL3';
UPDATE "assets" SET "search_text" = 'fluminense, flu, tricolor, tricolor carioca, guerreiro, lanceiro, pos-flu, fluminense fc, das laranjeiras' WHERE ticker = 'GUE4';
UPDATE "assets" SET "search_text" = 'gremio, imortal, tricolor gaucho, gremio fbpa, gremio porto alegre, gremio footbal, tricolor' WHERE ticker = 'IMO3';
UPDATE "assets" SET "search_text" = 'vasco da gama, vasco, cruzmaltino, cruz-maltino, vasco rj, sao januario, gigante da colina, vasco de sa' WHERE ticker = 'MAL4';
UPDATE "assets" SET "search_text" = 'palmeiras, alviverde, porco, palestra italia, sociedade esportiva palmeiras, verdao, palmeirenses' WHERE ticker = 'POR4';
UPDATE "assets" SET "search_text" = 'cruzeiro, raposa, celeste, cruzeiro mg, cruzeiro esporte clube, cabuloso, cruzeirenses' WHERE ticker = 'RAP3';
UPDATE "assets" SET "search_text" = 'corinthians, timao, sao jorge, sccp, sport club corinthians, fiel, corinthianos, timozao' WHERE ticker = 'TIM3';
UPDATE "assets" SET "search_text" = 'rb bragantino, bragantino, touro da mogiana, red bull bragantino, massa bruta, rb, braganca paulista' WHERE ticker = 'TOR3';
UPDATE "assets" SET "search_text" = 'bahia, tricolor baiano, tricolor, esquadrao de aco, bahia fc, esporte clube bahia, bahianos' WHERE ticker = 'TRI3';
UPDATE "assets" SET "search_text" = 'sao paulo, spfc, tricolor paulista, soberano, sao paulo fc, morumbi, sao paulo futebol clube' WHERE ticker = 'TRI4';
UPDATE "assets" SET "search_text" = 'flamengo, mengao, urubu, rubro-negro, crf, clube de regatas flamengo, flamenguistas, nacao' WHERE ticker = 'URU3';
UPDATE "assets" SET "search_text" = 'coritiba, coxa, coxa-branca, coritiba fc, coritibanos, couto pereira, alviverde paranaense' WHERE ticker = 'VOA4';

-- Serie B
UPDATE "assets" SET "search_text" = 'ec sao bernardo, sao bernardo, tigre do grande abc, abc paulista, sao bernardo fc, abc, grande abc' WHERE ticker = 'ABT4';
UPDATE "assets" SET "search_text" = 'tombense, cavalo de aco, tombos, tombense fc, cavalos, tombense mg' WHERE ticker = 'CAV4';
UPDATE "assets" SET "search_text" = 'chapecoense, chape, verdao do oeste, chapecoense sc, chapeco, chapecoense futebol' WHERE ticker = 'CON3';
UPDATE "assets" SET "search_text" = 'america-mg, coelho, america mineiro, americas, coelho do calafate, america mg, americano' WHERE ticker = 'COE3';
UPDATE "assets" SET "search_text" = 'cuiaba, dourado, cuiaba ec, cuiabanos, pantanal, cuiaba futebol clube, dourado do pantanal' WHERE ticker = 'DOU4';
UPDATE "assets" SET "search_text" = 'goias, periquito, esporte clube goias, goianienses, goias ec, verdao' WHERE ticker = 'DRA3';
UPDATE "assets" SET "search_text" = 'operario-pr, operario, fantasma, operario ferroviario, operario esporte clube, paranaense' WHERE ticker = 'FAS3';
UPDATE "assets" SET "search_text" = 'crb, clube de regatas brasil, galo da pajucara, alagoano, crb maceio, pajucara' WHERE ticker = 'GAP3';
UPDATE "assets" SET "search_text" = 'juventude, ju, indio, papo, juventude caxias, ec juventude, juventude rs, caxias do sul' WHERE ticker = 'IND4';
UPDATE "assets" SET "search_text" = 'sport recife, sport, leao, leao da ilha, sport club do recife, pernambucano, sport club' WHERE ticker = 'LEI3';
UPDATE "assets" SET "search_text" = 'avai, leao, leao da ilha sc, avai fc, florianopolis, avai futebol clube, avaiano' WHERE ticker = 'LEI4';
UPDATE "assets" SET "search_text" = 'paysandu, papao, leao azul, paysandu sport club, belem, paysan, paysandu pa' WHERE ticker = 'LEA3';
UPDATE "assets" SET "search_text" = 'fortaleza, leao do pici, tricolor cearense, fortaleza ec, tricolor, leao, cearenses, fortaleza ce' WHERE ticker = 'LEP4';
UPDATE "assets" SET "search_text" = 'vitoria, leao, leao da barra, vitoria ba, ecvitoria, rubro-negro baiano, vitoria salvador' WHERE ticker = 'LEB3';
UPDATE "assets" SET "search_text" = 'ponte preta, macaca, majestoso, ponte preta aa, campinas, aaponte, macaquinhos' WHERE ticker = 'MAC4';
UPDATE "assets" SET "search_text" = 'mirassol, leao, leaozinho, mirassol fc, mirassolenses, leao do interior' WHERE ticker = 'LEM3';
UPDATE "assets" SET "search_text" = 'nautico, timbu, clube nautico capibaribe, nautico recife, timbu pernambucano, capibaribe' WHERE ticker = 'NAF3';
UPDATE "assets" SET "search_text" = 'botafogo-sp, botafogo sao paulo, pantera, botafogo ribeirao preto, botafogo sp, pantera da mogiana' WHERE ticker = 'PAN3';
UPDATE "assets" SET "search_text" = 'goias, periquito, esporte clube goias, goianienses, goias ec, verdao do cerrado' WHERE ticker = 'PER3';
UPDATE "assets" SET "search_text" = 'joinville, jec, joinville esporte clube, joinvilenses, tigre, joinville sc' WHERE ticker = 'TIG4';
UPDATE "assets" SET "search_text" = 'vila nova, tigre, coloradinho, vila nova fc, goiania, vila nova go' WHERE ticker = 'TIS3';
UPDATE "assets" SET "search_text" = 'novorizontino, tigre, novorizontino fc, novo horizonte, tigrinho do vale do peixe' WHERE ticker = 'TIV3';
UPDATE "assets" SET "search_text" = 'londrina, tubarao, londrina ec, londrinenses, tubarao do cafe, lec' WHERE ticker = 'TUB3';
UPDATE "assets" SET "search_text" = 'ceara, vozao, ceara sc, ceara sporting club, ceara futebol, cearense, vozao ce' WHERE ticker = 'VOZ3';
