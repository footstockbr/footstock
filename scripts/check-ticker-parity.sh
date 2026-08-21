#!/usr/bin/env bash
# ============================================================================
# check-ticker-parity.sh — guard bloqueante de paridade entre as fontes de
# times/tickers do monorepo FootStock.
#
# Por que existe (T-12, loop 08-18-foot-stock-motor-noticias-analise, secao 10.4):
#   Coexistem tres fontes de tickers/clubes sem validacao cruzada:
#     1. TICKERS_40  — motor/src/news/NewsClassifier.ts. Alimenta o prompt do LLM
#        E o filtro de aceitacao em normalizeCandidates(): ticker fora da lista e
#        DESCARTADO com um logger.warn.
#     2. CLUBS_PUBLIC — footstock-next/src/lib/constants/clubs-public.ts. Lista
#        publica exibida no front.
#     3. assets.search_text — banco, carregado a cada ciclo por loadTickerAliases().
#   Assimetria concreta: um clube novo inserido em `assets` entra no prompt e no
#   fallback deterministico, mas o filtro TICKERS_40 continua congelado e joga
#   fora o ticker novo que o proprio LLM devolveu. O erro e silencioso do ponto
#   de vista do produto (so um warn no log do motor).
#
#   Alem disso, motor/src/news/ticker-fallback.ts e
#   footstock-next/src/lib/utils/ticker-resolver-core.ts sao copias espelhadas do
#   mesmo nucleo deterministico e precisam manter paridade.
#
# Escopo (o que este guard verifica):
#   C1 TICKERS_40 vs CLUBS_PUBLIC          — comparacao de CONJUNTO (a ordem
#                                            legitimamente difere entre os dois).
#   C2 loader de assets.search_text        — deteccao de DRIFT no mecanismo de
#                                            carregamento, via hash do corpo de
#                                            loadTickerAliases(). NAO e cobertura
#                                            de dados (ver limitacao em C2).
#   C3 paridade do core ticker-fallback    — comparacao SEMANTICA (exports,
#      vs ticker-resolver-core               assinaturas e corpo a partir do
#                                            primeiro `export`), nao byte-a-byte
#                                            do arquivo inteiro: os dois tem
#                                            cabecalhos de comentario distintos
#                                            por viverem em pacotes distintos.
#
# Relacao do C3 com o teste jest ja existente (nao e duplicacao cega):
#   motor/src/news/__tests__/ticker-parity-hash.test.ts (F18, commit d7c5110) ja
#   compara o hash do bloco compartilhado dos dois cores. Ele roda dentro de
#   `npm test` do motor, ou seja, SO no motor-deploy.yml (push em motor/**).
#   O ci.yml (pull request) nao instala nem testa o pacote motor, entao hoje um PR
#   que quebra a paridade do core passa verde. O C3 fecha essa janela por rodar
#   sem dependencia nenhuma nos tres workflows, e reporta o diff das linhas e da
#   superficie de export em vez de so um hash divergente. Se o teste jest for
#   ampliado para rodar em PR, o C3 vira redundante e pode ser removido.
#
# Uso:
#   bash scripts/check-ticker-parity.sh
#   npm run check:ticker-parity
#   bash scripts/check-ticker-parity.sh --update-baseline   # regrava o baseline do C2
#
# Exit codes:
#   0 = todas as fontes em paridade
#   1 = divergencia detectada (diff legivel no stdout)
#   2 = erro de uso/IO (arquivo-fonte ausente, bloco nao encontrado, etc)
# ============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

CLASSIFIER='motor/src/news/NewsClassifier.ts'
CLUBS='footstock-next/src/lib/constants/clubs-public.ts'
CORE_MOTOR='motor/src/news/ticker-fallback.ts'
CORE_NEXT='footstock-next/src/lib/utils/ticker-resolver-core.ts'
BASELINE='scripts/ticker-parity-baseline.json'

UPDATE_BASELINE=0
for arg in "$@"; do
  case "$arg" in
    --update-baseline) UPDATE_BASELINE=1 ;;
    -h|--help) awk 'NR>1 && /^#/ {print; next} NR>1 {exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "check-ticker-parity: argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

FAILED=0
fail() { echo "FAIL  $*"; FAILED=1; }
ok()   { echo "OK    $*"; }

require_file() {
  [ -f "$1" ] || { echo "ERRO  arquivo-fonte ausente: $1" >&2; exit 2; }
}
require_file "$CLASSIFIER"
require_file "$CLUBS"
require_file "$CORE_MOTOR"
require_file "$CORE_NEXT"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "============================================================"
echo "check-ticker-parity — paridade entre as fontes de times/tickers"
echo "============================================================"

# ---------------------------------------------------------------------------
# C1 — TICKERS_40 (motor) vs CLUBS_PUBLIC (front)
# ---------------------------------------------------------------------------
# Extracao estatica ancorada no NOME da constante, nunca em numero de linha:
# os dois arquivos ja migraram de linha desde o levantamento original.
sed -n '/const TICKERS_40 = \[/,/^\]/p' "$CLASSIFIER" > "$TMP/block_motor.txt"
sed -n '/export const CLUBS_PUBLIC/,/^\]/p' "$CLUBS" > "$TMP/block_next.txt"

# Um ticker COMENTADO esta desativado no runtime e nao pode contar como presente
# (probe ST007: `// 'TIS3',` passava batido e o check dava falso verde). Comentario
# de linha e removido antes da extracao; comentario de BLOCO nao e tratado e por
# isso e recusado explicitamente, em vez de silenciosamente ignorado.
strip_line_comments() { sed -e 's|^[[:space:]]*//.*||' -e 's|[[:space:]]//.*||' "$1"; }
for blk in "$TMP/block_motor.txt" "$TMP/block_next.txt"; do
  if grep -aq '/\*' "$blk"; then
    echo "ERRO  comentario de bloco (/* */) dentro do array em $blk" >&2
    echo "      este extrator so remove comentario de linha (//) — recusando para nao" >&2
    echo "      contar como ativo um ticker comentado em bloco (falso verde)" >&2
    exit 2
  fi
done

strip_line_comments "$TMP/block_motor.txt" \
  | grep -aoE "'[A-Z0-9]{3,4}'" | tr -d "'" | sort -u > "$TMP/motor.txt"
strip_line_comments "$TMP/block_next.txt" \
  | grep -aoE "ticker: '[A-Z0-9]{3,4}'" | grep -aoE "[A-Z0-9]{3,4}" | sort -u > "$TMP/next.txt"

n_motor=$(wc -l < "$TMP/motor.txt" | tr -d ' ')
n_next=$(wc -l < "$TMP/next.txt" | tr -d ' ')

if [ "$n_motor" -eq 0 ]; then
  echo "ERRO  bloco TICKERS_40 nao encontrado em $CLASSIFIER (constante renomeada ou removida?)" >&2
  exit 2
fi
if [ "$n_next" -eq 0 ]; then
  echo "ERRO  bloco CLUBS_PUBLIC nao encontrado em $CLUBS (constante renomeada ou removida?)" >&2
  exit 2
fi

echo
echo "-- C1  TICKERS_40 ($CLASSIFIER) vs CLUBS_PUBLIC ($CLUBS)"
echo "   tickers unicos: motor=$n_motor  front=$n_next"

only_motor=$(comm -23 "$TMP/motor.txt" "$TMP/next.txt")
only_next=$(comm -13 "$TMP/motor.txt" "$TMP/next.txt")

if [ -n "$only_motor" ] || [ -n "$only_next" ]; then
  if [ -n "$only_motor" ]; then
    echo "   Em TICKERS_40 mas NAO em CLUBS_PUBLIC (front nao exibe o clube):"
    printf '     - %s\n' $only_motor
  fi
  if [ -n "$only_next" ]; then
    echo "   Em CLUBS_PUBLIC mas NAO em TICKERS_40 (o filtro de aceitacao do"
    echo "   classificador DESCARTA este ticker mesmo quando o LLM acerta):"
    printf '     - %s\n' $only_next
  fi
  fail "C1 divergencia de conjunto entre TICKERS_40 e CLUBS_PUBLIC"
else
  ok "C1 conjuntos identicos ($n_motor tickers)"
fi

if [ "$n_motor" -ne 40 ]; then
  echo "   NOTA: a constante chama-se TICKERS_40 mas carrega $n_motor tickers."
  echo "         Isso NAO falha o check (o catalogo pode crescer), mas o nome"
  echo "         da constante passou a mentir — renomear ou documentar."
fi

# ---------------------------------------------------------------------------
# C2 — drift no loader de assets.search_text
# ---------------------------------------------------------------------------
# Bloco ancorado na assinatura do metodo, terminando no primeiro fechamento em
# indentacao de metodo ("  }"). Comentarios e espacos sao preservados de
# proposito: qualquer edicao no loader deve ser vista por um humano.
awk '
  /private async loadTickerAliases\(\): Promise<void> \{/ { inblock = 1 }
  inblock { print }
  inblock && /^  \}$/ { exit }
' "$CLASSIFIER" > "$TMP/loader.txt"

if [ ! -s "$TMP/loader.txt" ]; then
  echo "ERRO  metodo loadTickerAliases() nao encontrado em $CLASSIFIER" >&2
  exit 2
fi
if ! grep -aq 'FROM assets' "$TMP/loader.txt"; then
  echo "ERRO  bloco de loadTickerAliases() capturado nao contem a query 'FROM assets'" >&2
  echo "      (a captura do bloco quebrou — corrigir o awk deste script)" >&2
  exit 2
fi

loader_hash=$(sha256sum "$TMP/loader.txt" | cut -d' ' -f1)
loader_lines=$(wc -l < "$TMP/loader.txt" | tr -d ' ')

echo
echo "-- C2  loader de assets.search_text (loadTickerAliases, $loader_lines linhas)"
echo "   LIMITACAO DECLARADA: este check e um PROXY de drift do loader, NAO uma"
echo "   verificacao de cobertura. Ele NAO prova que todo ticker de TICKERS_40"
echo "   tem correspondente em assets.search_text — isso exige dado do banco,"
echo "   indisponivel no CI. Cobertura real fica como pendencia: gerar snapshot"
echo "   JSON versionado de assets (ticker + search_text) e validar TICKERS_40"
echo "   contra ele em teste de integracao separado."

if [ "$UPDATE_BASELINE" -eq 1 ]; then
  printf '{\n  "loader_block_sha256": "%s",\n  "loader_block_lines": %s,\n  "source": "%s",\n  "anchor": "private async loadTickerAliases(): Promise<void> {",\n  "note": "Baseline do C2 de scripts/check-ticker-parity.sh. Regravar com --update-baseline SOMENTE apos revisar a mudanca no loader."\n}\n' \
    "$loader_hash" "$loader_lines" "$CLASSIFIER" > "$BASELINE"
  ok "C2 baseline regravado em $BASELINE (sha256=${loader_hash:0:12})"
elif [ ! -f "$BASELINE" ]; then
  fail "C2 baseline ausente em $BASELINE — rodar 'bash scripts/check-ticker-parity.sh --update-baseline' e versionar o arquivo"
else
  baseline_hash=$(grep -oE '"loader_block_sha256": *"[a-f0-9]+"' "$BASELINE" | grep -oE '[a-f0-9]{64}')
  if [ -z "$baseline_hash" ]; then
    fail "C2 baseline $BASELINE ilegivel (campo loader_block_sha256 ausente ou malformado)"
  elif [ "$baseline_hash" != "$loader_hash" ]; then
    echo "   baseline: $baseline_hash"
    echo "   atual:    $loader_hash"
    echo "   O mecanismo de carregamento de assets.search_text mudou. Revisar o"
    echo "   diff do metodo loadTickerAliases() e, se a mudanca for intencional,"
    echo "   rodar: bash scripts/check-ticker-parity.sh --update-baseline"
    fail "C2 drift no loader de assets.search_text"
  else
    ok "C2 loader intacto (sha256=${loader_hash:0:12})"
  fi
fi

# ---------------------------------------------------------------------------
# C3 — paridade semantica ticker-fallback.ts vs ticker-resolver-core.ts
# ---------------------------------------------------------------------------
# Paridade SEMANTICA, nao byte-a-byte do arquivo: os cabecalhos de comentario
# divergem legitimamente (pacotes distintos, referencias cruzadas distintas).
# O core comparado comeca no primeiro `export` de cada arquivo.
awk '/^export /{f=1} f' "$CORE_MOTOR" > "$TMP/core_motor.ts"
awk '/^export /{f=1} f' "$CORE_NEXT"  > "$TMP/core_next.ts"

if [ ! -s "$TMP/core_motor.ts" ] || [ ! -s "$TMP/core_next.ts" ]; then
  echo "ERRO  nenhum 'export' encontrado em $CORE_MOTOR ou $CORE_NEXT" >&2
  exit 2
fi

# -a e obrigatorio: os dois cores usam um byte NUL literal como separador de
# chave de Map (`${alias}\0${ticker}` em buildAliasIndex), o que faz grep
# classificar o arquivo como binario e devolver zero match em vez das linhas.
# Sem -a a comparacao de exports rodaria sobre dois arquivos VAZIOS e passaria
# sempre — falso verde.
grep -aoE '^export (const|function|type|interface) [A-Za-z0-9_]+' "$TMP/core_motor.ts" | sort > "$TMP/exp_motor.txt"
grep -aoE '^export (const|function|type|interface) [A-Za-z0-9_]+' "$TMP/core_next.ts"  | sort > "$TMP/exp_next.txt"

# Guard anti-falso-verde: superficie de export vazia significa que a extracao
# quebrou (nunca que o core nao exporta nada).
if [ ! -s "$TMP/exp_motor.txt" ] || [ ! -s "$TMP/exp_next.txt" ]; then
  echo "ERRO  extracao da superficie de export devolveu vazia" >&2
  echo "      motor=$(wc -l < "$TMP/exp_motor.txt" | tr -d ' ') front=$(wc -l < "$TMP/exp_next.txt" | tr -d ' ')" >&2
  echo "      (corrigir a extracao deste script — comparar vazio com vazio seria falso verde)" >&2
  exit 2
fi

echo
echo "-- C3  paridade semantica do core deterministico"
echo "   motor: $CORE_MOTOR"
echo "   front: $CORE_NEXT"

if ! diff -a -u --label "$CORE_MOTOR (exports)" --label "$CORE_NEXT (exports)" \
        "$TMP/exp_motor.txt" "$TMP/exp_next.txt" > "$TMP/exp.diff"; then
  echo "   Superficie de export divergente:"
  sed 's/^/     /' "$TMP/exp.diff"
  fail "C3 exports divergentes entre os dois cores"
elif ! diff -a -u --label "$CORE_MOTOR (core)" --label "$CORE_NEXT (core)" \
        "$TMP/core_motor.ts" "$TMP/core_next.ts" > "$TMP/core.diff"; then
  echo "   Core divergente (a partir do primeiro export):"
  sed 's/^/     /' "$TMP/core.diff"
  fail "C3 core logic divergente entre motor e front"
else
  n_exports=$(wc -l < "$TMP/exp_motor.txt" | tr -d ' ')
  ok "C3 core equivalente ($n_exports exports, corpo identico a partir do primeiro export)"
fi

# ---------------------------------------------------------------------------
echo
echo "============================================================"
if [ "$FAILED" -eq 0 ]; then
  echo "check-ticker-parity: PARIDADE OK"
  echo "============================================================"
  exit 0
fi
echo "check-ticker-parity: DIVERGENCIA DETECTADA (ver FAIL acima)"
echo "============================================================"
exit 1
