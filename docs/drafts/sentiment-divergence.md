# Divergencia de sentimento: admin vs area publica

## Comportamento

O FootStock exibe o sentimento de cada ativo em duas superficies com comportamentos distintos:

- **Admin (painel de operacao):** o sentimento e exibido em **tempo real**, calculado pelo motor (`SentimentCalculator.ts`) e persistido diretamente nas colunas `assets.sentiment_score`, `assets.sentiment_reason` e `assets.sentiment_components`. A API admin (`/api/v1/admin/assets`) faz `select` direto dessas colunas sem aplicar qualquer atraso.

- **Area publica (portal do usuario):** o sentimento e exibido **atrasado** conforme o plano contratado pelo usuario, aplicado via `DelayService.ts` (`applyDelayBatch` / `getDelayedSentimentBatch`). O atraso e definido pela constante `DELAY_BY_PLAN` em `limits.ts`.

## Tabela de atrasos

| Plano   | Atraso sentimento | Atraso preco |
|---------|-------------------|--------------|
| JOGADOR | 60 minutos        | 60 minutos   |
| CRAQUE  | 30 minutos        | 30 minutos   |
| LENDA   | tempo real        | tempo real   |

## Motivo

Decisao de produto (source.md, item 015):

- O admin e uma **ferramenta de operacao** que precisa do valor mais fresco para tomar decisoes sobre ajustes de ativo, halt e curadoria. Aplicar atraso ao admin prejudicaria a operacao.
- A area publica **respeita o plano contratado** pelo usuario. Usuarios JOGADOR e CRAQUE pagam por dados atrasados; somente LENDA tem direito a tempo real.

Essa divergencia e intencional. Um operador admin pode ver sentimento BULLISH enquanto um usuario JOGADOR ve NEUTRO para o mesmo ativo, porque o usuario esta vendo o valor de 60 minutos atras. Isso nao e defeito.

## Risco mitigado

Sem essa documentacao, um operador admin que tambem possui uma conta publica (JOGADOR/CRAQUE) pode ver valores diferentes entre as duas interfaces e reportar como defeito ao suporte. O aviso na UI admin (item 022 do loop) torna a divergencia explicita no ponto de uso.

## Referencias

- `DELAY_BY_PLAN` em `footstock-next/src/lib/constants/limits.ts` (linhas 59-62)
- `DelayService.ts` em `footstock-next/src/lib/services/DelayService.ts` (funcoes `applyDelayBatch`, `getDelayedSentimentBatch`)
- API admin: `footstock-next/src/app/api/v1/admin/assets/route.ts` (select direto, sem delay)
- Componente admin: `footstock-next/src/components/admin/SentimentDecomposition.tsx` (aviso inline)
- Loop 08-17-foot-stock-sentimento-vivo-motor-ativos: itens 015 (delay publico) e 017 (decomposicao admin)
