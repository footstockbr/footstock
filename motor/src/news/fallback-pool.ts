// Fallback pool de 20 notícias genéricas de futebol brasileiro
// Usadas quando RSS e LLM falham simultaneamente

export interface FallbackNews {
  title: string
  content: string
  category: string
}

const FALLBACK_POOL: FallbackNews[] = [
  { title: 'Brasileirão segue com disputas acirradas no topo da tabela', content: 'As equipes da elite do futebol brasileiro travam batalha intensa pelas primeiras posições do campeonato nacional.', category: 'brasileirao' },
  { title: 'Mercado da bola: transferências movimentam clubes brasileiros', content: 'Vários clubes brasileiros estão atentos ao mercado de transferências em busca de reforços para a temporada.', category: 'mercado' },
  { title: 'Seleção Brasileira prepara próximas convocações', content: 'A comissão técnica da Seleção Brasileira analisa o desempenho dos atletas nas competições nacionais e internacionais.', category: 'selecao' },
  { title: 'Copa do Brasil: definidos confrontos da próxima fase', content: 'Os jogos da Copa do Brasil prometem grandes embates entre times de diferentes estados do país.', category: 'copa' },
  { title: 'Clubes investem em categorias de base para o futuro', content: 'Grandes clubes brasileiros intensificam investimentos nas categorias de base visando revelar novos talentos.', category: 'base' },
  { title: 'Estadios passam por modernização no Brasil', content: 'Projetos de reforma e modernização de estádios estão em andamento em diversas cidades brasileiras.', category: 'infraestrutura' },
  { title: 'Tecnologia VAR consolidada no futebol brasileiro', content: 'O sistema de Árbitro de Vídeo segue gerando debates e polêmicas nas rodadas do campeonato nacional.', category: 'tecnologia' },
  { title: 'Fluminense e Flamengo vencem no carioca', content: 'Clássicos do futebol carioca movimentam a tabela do campeonato estadual do Rio de Janeiro.', category: 'carioca' },
  { title: 'Paulistão tem início com expectativas altas', content: 'O campeonato paulista começa com fortes candidatos ao título entre os principais clubes do estado.', category: 'paulistao' },
  { title: 'Sul-Americano de base revela novos talentos', content: 'O torneio sub-20 da CONMEBOL apresenta promessas que podem brilhar no futebol profissional em breve.', category: 'base' },
  { title: 'Arbitragem profissional avança no futebol brasileiro', content: 'A CBF segue com programa de capacitação e profissionalização dos árbitros das principais competições.', category: 'arbitragem' },
  { title: 'Libertadores: brasileiros buscam hegemonia continental', content: 'Equipes brasileiras travam embates decisivos na Copa Libertadores da América buscando o título continental.', category: 'libertadores' },
  { title: 'Sul-Americana: Brasil tem representantes em boa fase', content: 'Times brasileiros avançam nas fases da Copa Sul-Americana com atuações consistentes.', category: 'sulamericana' },
  { title: 'Voltas de ídolos ao futebol brasileiro aquecem mercado', content: 'Retorno de jogadores ídolos ao Brasil movimenta torcidas e mercado de atletismo nacional.', category: 'mercado' },
  { title: 'Futebol feminino cresce no Brasil', content: 'O futebol feminino brasileiro vive momento de expansão com mais investimentos e visibilidade nas competições.', category: 'feminino' },
  { title: 'Grêmio e Internacional dominam o gauchão', content: 'Os dois grandes do Rio Grande do Sul se destacam no campeonato gaúcho com elencos reforçados.', category: 'gaucho' },
  { title: 'Mineiro: Atlético e Cruzeiro brigam pelo título', content: 'Clássico mineiro define estratégias para a temporada com rivais históricos em rota de colisão.', category: 'mineiro' },
  { title: 'Novas regras no futebol entram em vigor', content: 'A FIFA e a IFAB aprovam mudanças nas regras do futebol que passam a vigorar nas principais competições.', category: 'regras' },
  { title: 'Patrocínios crescem no futebol brasileiro', content: 'O mercado de patrocínios esportivos mostra crescimento significativo no futebol nacional com novos acordos.', category: 'negocios' },
  { title: 'Brasileiros no exterior em destaque', content: 'Jogadores brasileiros que atuam na Europa e outras ligas estrangeiras se destacam com boas atuações.', category: 'exterior' },
]

let lastUsedIndex = -1

/** Retorna uma notícia do fallback pool sem repetição imediata */
export function getFallbackNews(): FallbackNews {
  let idx
  do {
    idx = Math.floor(Math.random() * FALLBACK_POOL.length)
  } while (idx === lastUsedIndex)
  lastUsedIndex = idx
  return FALLBACK_POOL[idx]
}

/** Retorna N notícias do fallback pool sem repetições */
export function getFallbackNewsBatch(n: number): FallbackNews[] {
  const shuffled = [...FALLBACK_POOL].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, FALLBACK_POOL.length))
}
