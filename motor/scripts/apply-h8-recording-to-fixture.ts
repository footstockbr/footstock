/**
 * Apply H8 real-http recording artifact to multi-team-golden-set.ts fixture.
 * Updates GOLDEN_SET_META and each GOLDEN_SET case with recorded llm responses,
 * sets provenance to 'real-http', acquisition to 'provider-http', and clears
 * simulated modelError flags.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const MOTOR_ROOT = path.resolve(__dirname, '..')
const FIXTURE_PATH = path.join(
  MOTOR_ROOT,
  'src/news/__tests__/fixtures/multi-team-golden-set.ts',
)
const ARTIFACT_PATH = path.join(
  MOTOR_ROOT,
  '../../../../blacksmith/loop-archives/07-31-plano-acao-fechamento-multi-time/reviews/H8-GOLDEN-SET-RECORDED.json',
)

interface RecordedCase {
  id: string
  ok: boolean
  llm: {
    teams: Array<{ ticker: string; sentiment: number; confidence: number }>
    impactCategory: string
    relevance: number
  }
  recordedAt: string
  latencyMs: number
}

interface RecordedArtifact {
  schema: string
  status: string
  h8Decision: string
  provenance: 'real-http'
  acquisition: 'provider-http'
  productionH8Eligible: boolean
  recordedAt: string
  provider: string
  model: string
  classifier_output_version_base: string
  caseCount: number
  attemptedCount: number
  okCount: number
  failCount: number
  requestCount: number
  cases: RecordedCase[]
}

function loadArtifact(): RecordedArtifact {
  const raw = fs.readFileSync(ARTIFACT_PATH, 'utf8')
  return JSON.parse(raw) as RecordedArtifact
}

function objectLiteralTextFromRecorded(caseData: RecordedCase): string {
  const teamsText = caseData.llm.teams
    .map(
      (t) =>
        `        { ticker: '${t.ticker}', sentiment: ${t.sentiment}, confidence: ${t.confidence} },`,
    )
    .join('\n')
  return `{
      teams: [
${teamsText}
      ],
      impactCategory: '${caseData.llm.impactCategory}',
      relevance: ${caseData.llm.relevance},
    }`
}

function updateFixture(artifact: RecordedArtifact): void {
  const sourceText = fs.readFileSync(FIXTURE_PATH, 'utf8')
  const sourceFile = ts.createSourceFile(
    FIXTURE_PATH,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  )

  const caseById = new Map(artifact.cases.map((c) => [c.id, c]))
  const edits: Array<{ start: number; end: number; text: string }> = []

  function visit(node: ts.Node) {
    // Update GOLDEN_SET_META object literal
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'GOLDEN_SET_META' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      edits.push({
        start: node.initializer.getStart(sourceFile),
        end: node.initializer.getEnd(),
        text: `{
  schema: 'h8-golden-set-meta/v1',
  provenance: 'real-http',
  acquisition: 'provider-http',
  productionH8Eligible: true,
  provider: '${artifact.provider}',
  model: '${artifact.model}',
  recordedAt: '${artifact.recordedAt}',
  note: 'Gravacao real-http via Kimi em 2026-08-18. Evidencia H8/G3 liberada para revisao formal.',
}`,
      })
    }

    // Find each GOLDEN_SET case object literal and patch llm + provenance + remove modelError
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === 'llm' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const caseObj = node.parent
      if (!ts.isObjectLiteralExpression(caseObj)) return

      const idProp = caseObj.properties.find(
        (p): p is ts.PropertyAssignment =>
          ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'id',
      )
      if (!idProp || !ts.isStringLiteral(idProp.initializer)) return

      const id = idProp.initializer.text
      const recorded = caseById.get(id)
      if (!recorded) return

      edits.push({
        start: node.initializer.getStart(sourceFile),
        end: node.initializer.getEnd(),
        text: objectLiteralTextFromRecorded(recorded),
      })
    }

    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === 'provenance' &&
      ts.isStringLiteral(node.initializer)
    ) {
      const caseObj = node.parent
      if (!ts.isObjectLiteralExpression(caseObj)) return

      const idProp = caseObj.properties.find(
        (p): p is ts.PropertyAssignment =>
          ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'id',
      )
      if (!idProp || !ts.isStringLiteral(idProp.initializer)) return

      const id = idProp.initializer.text
      if (caseById.has(id)) {
        edits.push({
          start: node.initializer.getStart(sourceFile),
          end: node.initializer.getEnd(),
          text: "'real-http'",
        })
      }
    }

    // Remove modelError property assignments inside golden cases
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === 'modelError'
    ) {
      const caseObj = node.parent
      if (!ts.isObjectLiteralExpression(caseObj)) return

      const idProp = caseObj.properties.find(
        (p): p is ts.PropertyAssignment =>
          ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'id',
      )
      if (!idProp || !ts.isStringLiteral(idProp.initializer)) return

      const id = idProp.initializer.text
      if (caseById.has(id)) {
        // Remove the whole line including trailing comma and newline
        let start = node.getFullStart()
        let end = node.getEnd()
        // Extend end to consume trailing comma
        if (sourceText[end] === ',') end += 1
        // Extend to consume trailing newline(s) but preserve one for spacing
        while (end < sourceText.length && sourceText[end] === '\n') end += 1
        // Pull start back to consume leading whitespace/newline to keep clean
        while (start > 0 && sourceText[start - 1] === '\n') start -= 1
        edits.push({ start, end, text: '\n' })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  // Apply edits in reverse order (last first) so positions remain valid
  edits.sort((a, b) => b.start - a.start)
  let result = sourceText
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  }

  fs.writeFileSync(FIXTURE_PATH, result, 'utf8')
  console.log(`Updated fixture: ${FIXTURE_PATH}`)
  console.log(`Cases updated: ${caseById.size}`)
}

function main(): void {
  const artifact = loadArtifact()
  if (artifact.status !== 'complete' || artifact.okCount !== 32) {
    throw new Error(
      `Artifact not complete: status=${artifact.status} okCount=${artifact.okCount}`,
    )
  }
  updateFixture(artifact)
}

main()
