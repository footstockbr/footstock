import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter, log: ['error'] })

async function main() {
  const assets = await prisma.asset.findMany({
    select: {
      ticker: true, cluster: true, division: true,
      currentPrice: true, openPrice: true, fairValue: true,
      isHalted: true, volume: true, updatedAt: true,
    },
    orderBy: [{ division: 'asc' }, { cluster: 'asc' }, { ticker: 'asc' }],
  })

  const now = Date.now()
  console.log(`\n[snapshot] ${new Date().toISOString()} — 40 ativos\n`)
  console.log('| Ticker | Cluster   | Open   | Atual  | Var%    | DevFV   | Vol      | Halt | Age(s) |')
  console.log('|--------|-----------|--------|--------|---------|---------|----------|------|--------|')

  let totalVar = 0, totalDev = 0, halted = 0, maxAbsVar = 0
  for (const a of assets) {
    const cur = Number(a.currentPrice)
    const op = Number(a.openPrice)
    const fv = Number(a.fairValue)
    const var24 = op > 0 ? ((cur - op) / op) * 100 : 0
    const devFV = fv > 0 ? ((cur - fv) / fv) * 100 : 0
    const age = Math.round((now - new Date(a.updatedAt).getTime()) / 1000)
    totalVar += Math.abs(var24)
    totalDev += Math.abs(devFV)
    if (a.isHalted) halted++
    if (Math.abs(var24) > maxAbsVar) maxAbsVar = Math.abs(var24)
    console.log(
      `| ${a.ticker.padEnd(6)} | ${a.cluster.padEnd(9)} | ${op.toFixed(2).padStart(6)} | ${cur.toFixed(2).padStart(6)} | ${(var24 >= 0 ? '+' : '') + var24.toFixed(2).padStart(6)}% | ${(devFV >= 0 ? '+' : '') + devFV.toFixed(2).padStart(6)}% | ${Number(a.volume).toString().padStart(8)} | ${(a.isHalted ? 'SIM' : '-').padEnd(4)} | ${age.toString().padStart(6)} |`,
    )
  }
  console.log('')
  console.log(`Total halts: ${halted}/40`)
  console.log(`|Var24h| média: ${(totalVar / 40).toFixed(3)}%   máx: ${maxAbsVar.toFixed(2)}%`)
  console.log(`|DevFV| média:  ${(totalDev / 40).toFixed(3)}%`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
