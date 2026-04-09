import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://nxuekhsfvvxdwctthaux.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54dWVraHNmdnZ4ZHdjdHRoYXV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDU2NjY2NCwiZXhwIjoyMDkwMTQyNjY0fQ.HB1GGnwcQNpD8RBxx_6wedJVw51usLREN4QQtmCPTqo'
)

const tickers = ['FOG3','GAL3','POR4','TIM3','TRI4','URU3']

async function snap(label) {
  const { data } = await sb.from('assets')
    .select('ticker,current_price,fair_value')
    .in('ticker', tickers).order('ticker')
  const row = data.map(a => {
    const cur = Number(a.current_price), fv = Number(a.fair_value)
    const pct = ((cur - fv) / fv * 100).toFixed(1)
    return `${a.ticker}=${cur.toFixed(2)}(${pct}%)`
  }).join(' | ')
  console.log(label, row)
  return data
}

const d0 = await snap('T=0s  ')
await new Promise(r => setTimeout(r, 30000)); await snap('T=30s ')
await new Promise(r => setTimeout(r, 30000)); await snap('T=60s ')
await new Promise(r => setTimeout(r, 30000)); await snap('T=90s ')
await new Promise(r => setTimeout(r, 30000)); const d4 = await snap('T=120s')

const allOk    = d4.every(a => Number(a.current_price) > 5)
const nearFV   = d4.every(a => Math.abs(Number(a.current_price) - Number(a.fair_value)) / Number(a.fair_value) < 0.25)
const moving   = d4.some((a,i) => Math.abs(Number(a.current_price) - Number(d0[i].current_price)) > 0.01)

console.log('\n--- Resultado ---')
console.log(allOk  ? '✓ Todos > 5'                              : '✗ Algum <= 5 — ainda corrompido')
console.log(nearFV ? '✓ Todos dentro de 25% do fair value'      : '✗ Algum drift > 25% do fair value')
console.log(moving ? '✓ Motor ativo (DB variando)'              : '⚠ DB estático')
