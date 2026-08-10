// ============================================================================
// Testes — extract-json-payload
//
// Regressão do incidente 2026-07-30/08-10: o Sonnet passou a devolver o JSON
// dentro de code fence markdown (~83% das chamadas) ou com preâmbulo em prosa
// (~17%), e o `JSON.parse` cru derrubava 100% das notícias em `parse_invalid`.
// Os payloads abaixo são cópias literais de respostas colhidas em produção.
// ============================================================================

import { extractJsonPayload } from '../extract-json-payload'

const PAYLOAD =
  '{"teams":[{"ticker":"REG3","sentiment":-0.3,"confidence":0.9},' +
  '{"ticker":"GUE3","sentiment":-0.6,"confidence":0.95}],' +
  '"impactCategory":"ESPORTIVA_MAJORITARIA","relevance":0.6}'

describe('extractJsonPayload', () => {
  describe('caminho feliz (strategy=raw)', () => {
    test('JSON puro passa sem alteração', () => {
      expect(extractJsonPayload(PAYLOAD)).toEqual({ json: PAYLOAD, strategy: 'raw' })
    })

    test('JSON puro com whitespace em volta é aparado', () => {
      expect(extractJsonPayload(`\n  ${PAYLOAD}\n\n`)).toEqual({ json: PAYLOAD, strategy: 'raw' })
    })

    test('teams vazio (veredito editorial legítimo) continua raw', () => {
      const vazio = '{"teams":[],"impactCategory":"ESPORTIVA_MENOR","relevance":0.0}'
      expect(extractJsonPayload(vazio)).toEqual({ json: vazio, strategy: 'raw' })
    })

    test('BOM antes do objeto não derruba o parse', () => {
      // `trim()` não apara U+FEFF; sem o strip explícito o JSON.parse direto
      // falharia e o payload cairia no scanner (ou em parse_invalid).
      expect(extractJsonPayload('\uFEFF' + PAYLOAD)).toEqual({ json: PAYLOAD, strategy: 'raw' })
    })

    test('chave extra desconhecida não reprova o payload', () => {
      // O modelo anexar `"analysis"` é cosmético: parseTeams ignora campo que
      // não conhece, e recusar aqui jogaria fora classificação boa.
      const comExtra =
        '{"teams":[],"impactCategory":"INSTITUCIONAL","relevance":0.2,' +
        '"analysis":"Nenhum clube da lista é afetado diretamente."}'
      expect(extractJsonPayload(comExtra)).toEqual({ json: comExtra, strategy: 'raw' })
    })

    test('teams como objeto em vez de array ainda é extraído', () => {
      // O extrator valida SHAPE (tem campo de notícia + campo de time), não
      // tipo. Normalizar `teams` é responsabilidade do parseTeams — devolver
      // null aqui esconderia o payload do classificador sem necessidade.
      const teamsObjeto =
        '{"teams":{"ticker":"REG3","sentiment":-0.3},"impactCategory":"ESPORTIVA_MENOR","relevance":0.4}'
      expect(extractJsonPayload(teamsObjeto)).toEqual({ json: teamsObjeto, strategy: 'raw' })
    })
  })

  describe('code fence markdown (strategy=fenced)', () => {
    test('```json — payload real de produção 2026-08-10', () => {
      const bruto = '```json\n' + PAYLOAD + '\n```'
      expect(extractJsonPayload(bruto)).toEqual({ json: PAYLOAD, strategy: 'fenced' })
    })

    test('``` sem linguagem', () => {
      expect(extractJsonPayload('```\n' + PAYLOAD + '\n```')).toEqual({
        json: PAYLOAD,
        strategy: 'fenced',
      })
    })

    test('```JSON em caixa alta', () => {
      expect(extractJsonPayload('```JSON\n' + PAYLOAD + '\n```')).toEqual({
        json: PAYLOAD,
        strategy: 'fenced',
      })
    })

    test('fence de prosa antes da fence de JSON', () => {
      // O modelo abre um bloco ```text com o raciocínio e só depois o ```json.
      // A varredura precisa percorrer TODAS as fences, não parar na primeira.
      const bruto =
        '```text\nAnálise: dois clubes da lista, derrota fora de casa.\n```\n' +
        '```json\n' + PAYLOAD + '\n```'
      expect(extractJsonPayload(bruto)).toEqual({ json: PAYLOAD, strategy: 'fenced' })
    })

    test('fence com prosa antes e depois', () => {
      const bruto = 'Aqui está a classificação:\n\n```json\n' + PAYLOAD + '\n```\n\nEspero ter ajudado.'
      expect(extractJsonPayload(bruto)).toEqual({ json: PAYLOAD, strategy: 'fenced' })
    })

    test('fence aberta sem fechar (truncamento em max_tokens) cai no scanner', () => {
      // Sem a cerca final o regex de fence não casa, mas o objeto está completo.
      const bruto = '```json\n' + PAYLOAD
      expect(extractJsonPayload(bruto)).toEqual({ json: PAYLOAD, strategy: 'embedded' })
    })
  })

  describe('prosa em volta do JSON (strategy=embedded)', () => {
    test('preâmbulo em inglês — payload real de produção 2026-08-10', () => {
      const bruto =
        'I need to analyze this news about Rogério Caboclo and the CBF election.\n\n' + PAYLOAD
      expect(extractJsonPayload(bruto)).toEqual({ json: PAYLOAD, strategy: 'embedded' })
    })

    test('preâmbulo em português com chave solta antes do JSON', () => {
      // A chave solta no texto derrubaria um regex guloso `/(\{[\s\S]*\})/`,
      // que recortaria do primeiro `{` da prosa até o último `}` do objeto.
      const bruto = 'A notícia trata de uma partida entre {times} estrangeiros.\n' + PAYLOAD
      expect(extractJsonPayload(bruto)).toEqual({ json: PAYLOAD, strategy: 'embedded' })
    })

    test('epílogo depois do JSON', () => {
      const bruto = PAYLOAD + '\n\nObservação: o Guerreiro perdeu em casa.'
      expect(extractJsonPayload(bruto)).toEqual({ json: PAYLOAD, strategy: 'embedded' })
    })

    test('chave dentro de string não fecha o objeto cedo', () => {
      const comChave = '{"teams":[],"impactCategory":"INSTITUCIONAL","relevance":0.1,"nota":"placar {2}"}'
      expect(extractJsonPayload('Segue:\n' + comChave)).toEqual({
        json: comChave,
        strategy: 'embedded',
      })
    })

    test('aspas escapadas dentro de string não confundem o scanner', () => {
      const comAspas = '{"teams":[],"impactCategory":"INSTITUCIONAL","relevance":0,"nota":"disse \\"fora\\" }"}'
      expect(extractJsonPayload('Resposta: ' + comAspas)).toEqual({
        json: comAspas,
        strategy: 'embedded',
      })
    })
  })

  describe('recusa (null) — deve virar parse_invalid no chamador', () => {
    test('texto sem JSON nenhum', () => {
      expect(extractJsonPayload('Flamengo ganhou muito bem hoje')).toBeNull()
    })

    test('string vazia', () => {
      expect(extractJsonPayload('')).toBeNull()
      expect(extractJsonPayload('   \n  ')).toBeNull()
    })

    test('fence com JSON sintaticamente inválido', () => {
      expect(extractJsonPayload('```json\n{"teams":[{"ticker":"REG3",}\n```')).toBeNull()
    })

    test('JSON truncado no meio (max_tokens estourado)', () => {
      expect(extractJsonPayload('{"teams":[{"ticker":"REG3","sentiment":-0.3')).toBeNull()
    })

    test('array de topo é recusado — contrato é objeto', () => {
      // O scanner até acha o objeto interno, mas ele não tem campo de notícia
      // (impactCategory/relevance), então o gate de shape o descarta em vez de
      // promover um item de time a classificação inteira.
      expect(extractJsonPayload('[{"ticker":"REG3"}]')).toBeNull()
      expect(extractJsonPayload('[1, 2, 3]')).toBeNull()
    })

    test('item de teams solto não vira classificação', () => {
      // Resposta truncada logo depois do primeiro time: o objeto interno
      // parseia sem erro. Aceitá-lo publicaria uma classificação mono-time
      // inventada — pior do que cair no fallback determinístico.
      const soUmTime = 'Analisando:\n{"ticker":"REG3","sentiment":-0.3,"confidence":0.9}'
      expect(extractJsonPayload(soUmTime)).toBeNull()
    })

    test('objeto sem campo de time é recusado', () => {
      expect(extractJsonPayload('{"impactCategory":"INSTITUCIONAL","relevance":0.3}')).toBeNull()
    })

    test('primitivos são recusados', () => {
      expect(extractJsonPayload('"URU3"')).toBeNull()
      expect(extractJsonPayload('null')).toBeNull()
      expect(extractJsonPayload('42')).toBeNull()
    })

    test('entrada não-string', () => {
      expect(extractJsonPayload(undefined as unknown as string)).toBeNull()
      expect(extractJsonPayload(null as unknown as string)).toBeNull()
    })
  })

  describe('ambiguidade — duas classificações distintas recusam', () => {
    test('duas fences com vereditos diferentes viram null', () => {
      // Escolher por posição arriscaria publicar o rascunho como veredito
      // final. Sem critério para decidir, degradar é o comportamento correto.
      const outro = '{"teams":[],"impactCategory":"INSTITUCIONAL","relevance":0.1}'
      const bruto = '```json\n' + PAYLOAD + '\n```\n\nOu talvez:\n```json\n' + outro + '\n```'
      expect(extractJsonPayload(bruto)).toBeNull()
    })

    test('rascunho seguido de versão final vira null', () => {
      const rascunho = '{"teams":[{"ticker":"REG3","sentiment":-0.3,"confidence":0.5}],' +
        '"impactCategory":"ESPORTIVA_MENOR","relevance":0.3}'
      const bruto = 'Primeira tentativa:\n' + rascunho + '\n\nCorrigindo:\n' + PAYLOAD
      expect(extractJsonPayload(bruto)).toBeNull()
    })

    test('o MESMO objeto repetido não é ambiguidade', () => {
      // Dedup por forma canônica: fence + scanner acham o mesmo payload, e
      // repetir a resposta idêntica é desobediência de formato, não conflito.
      const bruto = '```json\n' + PAYLOAD + '\n```\nRepetindo: ' + PAYLOAD
      expect(extractJsonPayload(bruto)).toEqual({ json: PAYLOAD, strategy: 'fenced' })
    })

    test('objeto inválido antes do válido não bloqueia a varredura', () => {
      const bruto = 'Rascunho: {"teams": [,]} \nCorreto:\n' + PAYLOAD
      expect(extractJsonPayload(bruto)).toEqual({ json: PAYLOAD, strategy: 'embedded' })
    })
  })
})
