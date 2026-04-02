# NOTICE — Atribuições de Software de Terceiros

**Projeto:** Foot Stock  
**Gerado em:** 2026-04-01  
**Gerado por:** /dependency-audit

Este projeto utiliza os seguintes componentes de software de terceiros:

---

## Licenças Permissivas (MIT, Apache-2.0, BSD, ISC, 0BSD, Unlicense, CC0)

A grande maioria das dependências (~1.115 pacotes) está licenciada sob licenças permissivas, incluindo:

- **MIT:** axios, next, react, react-dom, react-hook-form, zod, date-fns, tailwind-merge, clsx, ioredis, lucide-react, recharts, resend, jszip (opção MIT), e ~900 outros
- **Apache-2.0:** @simplewebauthn/browser, @simplewebauthn/server, @simplewebauthn/types, e ~80 outros
- **ISC:** semver, glob, lru-cache, lucide-react (alternativo), d3-*, e ~50 outros
- **BSD-3-Clause:** source-map, tough-cookie, @sentry/cli, esquery, e ~27 outros
- **BSD-2-Clause:** ~18 pacotes

Uso livre em projetos proprietários. Sem restrições de distribuição, desde que avisos de copyright sejam mantidos.

---

## Licenças MPL-2.0 (Copyleft Fraco)

Modificações diretas ao código destas bibliotecas devem ser abertas sob MPL-2.0. O projeto proprietário em si não precisa ser aberto.

| Pacote | Versão | Uso |
|--------|--------|-----|
| axe-core | 4.11.1 | Testes de acessibilidade (dev) |
| @axe-core/playwright | 4.11.1 | Testes de acessibilidade via Playwright (dev) |
| lightningcss | 1.32.0 | Processamento CSS (build via Tailwind v4) |
| lightningcss-linux-x64-gnu | 1.32.0 | Binário nativo lightningcss (build) |
| lightningcss-linux-x64-musl | 1.32.0 | Binário nativo lightningcss musl (build) |

---

## Licenças LGPL-3.0-or-later (Copyleft Fraco)

Modificações à biblioteca em si devem ser abertas. O linking estático pode exigir disponibilidade do objeto linkável.

| Pacote | Versão | Uso |
|--------|--------|-----|
| @img/sharp-libvips-linux-x64 | 1.2.4 | Processamento de imagens (libvips, build) |
| @img/sharp-libvips-linuxmusl-x64 | 1.2.4 | Processamento de imagens musl (build) |

---

## Dual-License (opção permissiva disponível)

| Pacote | Versão | Licença | Opção Utilizada |
|--------|--------|---------|-----------------|
| jszip | 3.10.1 | MIT OR GPL-3.0-or-later | **MIT** |
| node-forge | 1.4.0 | BSD-3-Clause OR GPL-2.0 | **BSD-3-Clause** |

---

## Licença Desconhecida — Verificação Manual Necessária

| Pacote | Versão | Uso | Status |
|--------|--------|-----|--------|
| exit | 0.1.2 | Dev transitiva (jest) | MIT no repositório GitHub (cowboy/node-exit), mas não declarado no package.json. Baixo risco. |

---

*Gerado automaticamente por /dependency-audit. Revisar antes de distribuição pública.*  
*Para auditoria completa de vulnerabilidades, consultar: output/docs/foot-stock/project/DEPENDENCY-AUDIT.md*
