/**
 * Testes do contrato de contadores — item 007 / T-06 criterio 3 do loop
 * 08-18-foot-stock-motor-noticias-analise.
 *
 * O modulo `@/lib/admin/news-counts` guarda a decisao que impede a tela de
 * anunciar numero de PAGINA como se fosse do ACERVO. As suites de rota provam
 * que os headers SAO EMITIDOS; esta prova o que se faz com eles.
 */

import {
  ARCHIVED_COUNT_HEADER,
  DRAFT_COUNT_HEADER,
  PUBLISHED_COUNT_HEADER,
  QUARANTINE_COUNT_HEADER,
  readAcervoCounts,
  readCountHeader,
  resolveDisplayCounts,
} from '@/lib/admin/news-counts'

/** Header bag minima, no shape que `Response.headers` expoe. */
function headers(bag: Record<string, string>) {
  return { get: (name: string) => (name in bag ? bag[name] : null) }
}

const FULL: Record<string, string> = {
  [PUBLISHED_COUNT_HEADER]: '101',
  [DRAFT_COUNT_HEADER]: '7',
  [ARCHIVED_COUNT_HEADER]: '3',
}

const PAGE_COUNTS = { published: 2, draft: 0, archived: 0 }

describe('nomes dos headers sao fonte unica', () => {
  test('produtor e consumidor leem as mesmas constantes', () => {
    // Se alguem renomear um header, tem de renomear AQUI, e os dois lados
    // acompanham. Duplicar a string em cada lado e o que faz um lado parar de
    // achar o header e a tela cair no fallback sem ninguem notar.
    expect(QUARANTINE_COUNT_HEADER).toBe('X-Quarantine-Count')
    expect(PUBLISHED_COUNT_HEADER).toBe('X-Published-Count')
    expect(DRAFT_COUNT_HEADER).toBe('X-Draft-Count')
    expect(ARCHIVED_COUNT_HEADER).toBe('X-Archived-Count')
  })
})

describe('readCountHeader — ausencia e zero sao coisas diferentes', () => {
  test('zero e um valor legitimo, nunca confundido com ausente', () => {
    expect(readCountHeader(headers({ 'X-Draft-Count': '0' }), DRAFT_COUNT_HEADER)).toBe(0)
  })

  test('header ausente devolve null', () => {
    expect(readCountHeader(headers({}), DRAFT_COUNT_HEADER)).toBeNull()
  })

  test.each([['abc'], [''], ['-1'], ['1.5'], ['NaN'], ['Infinity']])(
    'valor ilegivel %p vira null e LOGA (Zero Silencio)',
    (raw) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      expect(readCountHeader(headers({ 'X-Draft-Count': raw }), DRAFT_COUNT_HEADER)).toBeNull()
      expect(warn).toHaveBeenCalledTimes(1)
      warn.mockRestore()
    }
  )
})

describe('readAcervoCounts — tudo-ou-nada', () => {
  test('os tres presentes viram um objeto de acervo', () => {
    expect(readAcervoCounts(headers(FULL))).toEqual({ published: 101, draft: 7, archived: 3 })
  })

  test.each([PUBLISHED_COUNT_HEADER, DRAFT_COUNT_HEADER, ARCHIVED_COUNT_HEADER])(
    'faltando %s, os outros dois sao descartados junto',
    (missing) => {
      const partial = { ...FULL }
      delete partial[missing]
      // Dois numeros do acervo e um da pagina na mesma linha seria pior que
      // linha nenhuma: parece completo e nao e.
      expect(readAcervoCounts(headers(partial))).toBeNull()
    }
  )

  test('zeros nos tres continuam sendo acervo, nao ausencia', () => {
    const zeros = headers({
      [PUBLISHED_COUNT_HEADER]: '0',
      [DRAFT_COUNT_HEADER]: '0',
      [ARCHIVED_COUNT_HEADER]: '0',
    })
    expect(readAcervoCounts(zeros)).toEqual({ published: 0, draft: 0, archived: 0 })
  })
})

describe('resolveDisplayCounts — o rotulo nunca descreve outro escopo', () => {
  test('com acervo, exibe o acervo e diz que e o acervo', () => {
    const r = resolveDisplayCounts({
      acervoCounts: { published: 101, draft: 7, archived: 3 },
      pageCounts: PAGE_COUNTS,
      includesQuarantine: false,
    })
    expect(r.counts).toEqual({ published: 101, draft: 7, archived: 3 })
    expect(r.scope).toBe('acervo')
    expect(r.scopeLabel).toBe('No acervo (quarentena oculta)')
  })

  test('sem acervo, cai para a pagina e ADMITE que e a pagina', () => {
    const r = resolveDisplayCounts({
      acervoCounts: null,
      pageCounts: PAGE_COUNTS,
      includesQuarantine: false,
    })
    expect(r.counts).toEqual(PAGE_COUNTS)
    expect(r.scope).toBe('pagina')
    expect(r.scopeLabel).toBe('Nesta página (quarentena oculta)')
  })

  test('com a quarentena ligada, o rotulo diz que ela entra na conta', () => {
    // Os tres contadores partem do mesmo `where` da listagem: com o toggle
    // ligado eles somam o que o gate editorial reteve. Sem o qualificador, "7
    // rascunhos" seria lido como "7 rascunhos publicaveis".
    const r = resolveDisplayCounts({
      acervoCounts: { published: 101, draft: 7, archived: 3 },
      pageCounts: PAGE_COUNTS,
      includesQuarantine: true,
    })
    expect(r.scopeLabel).toBe('No acervo (quarentena incluída)')
  })

  test('o fallback de pagina tambem carrega o recorte da quarentena', () => {
    const r = resolveDisplayCounts({
      acervoCounts: null,
      pageCounts: PAGE_COUNTS,
      includesQuarantine: true,
    })
    expect(r.scopeLabel).toBe('Nesta página (quarentena incluída)')
  })

  test('acervo zerado nao cai para a pagina', () => {
    // Regressao classica: `acervoCounts || pageCounts` com objeto valido de
    // zeros passaria, mas `published: 0` vindo de um `??` mal escrito no futuro
    // nao. O acervo zerado E a resposta certa quando o acervo esta vazio.
    const r = resolveDisplayCounts({
      acervoCounts: { published: 0, draft: 0, archived: 0 },
      pageCounts: { published: 9, draft: 9, archived: 9 },
      includesQuarantine: false,
    })
    expect(r.counts).toEqual({ published: 0, draft: 0, archived: 0 })
    expect(r.scope).toBe('acervo')
  })
})
