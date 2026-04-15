// ============================================================================
// Foot Stock — Seed: ContentModerationRules (T-028)
// 5 regras de moderação de conteúdo pré-seeded com isEnabled=false
// ============================================================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const RULES = [
  {
    name: 'new_user_with_links',
    description: 'Usuário com menos de 7 dias de conta postando links externos',
    // Detecta [LINK REMOVIDO] no conteúdo sanitizado (proxy para URL presente no original)
    pattern: '\\[LINK REMOVIDO\\]',
    isEnabled: false,
  },
  {
    name: 'spam_frequency',
    description: 'Mesmo conteúdo ou conteúdo similar postado 3 ou mais vezes em 1 hora',
    // Regra gerenciada via lógica Redis no ModerationEngine (pattern não usado diretamente)
    pattern: '^$', // placeholder — lógica especial no engine
    isEnabled: false,
  },
  {
    name: 'false_promises',
    description: 'Palavras-chave de promessa de ganho garantido',
    // Regex para termos de promessa de retorno financeiro garantido
    pattern:
      '(?:ganho|lucro|retorno|rendimento)\\s+(?:garantido|certo|assegurado)|(?:100%|200%|300%|500%)\\s+(?:de\\s+)?(?:lucro|ganho|retorno)|faça\\s+(?:dinheiro|grana)|enriqueça\\s+rápido|investimento\\s+seguro\\s+e\\s+(?:garantido|certo)',
    isEnabled: false,
  },
  {
    name: 'residual_pii',
    description: 'Dados pessoais que passaram pela sanitização básica',
    // Detecta padrões residuais de PII que possam ter escapado da sanitização principal
    pattern:
      '(?:meu\\s+cpf|meu\\s+cnpj|meu\\s+telefone|meu\\s+celular|meu\\s+e-?mail)\\s*[:\\-]?\\s*\\d|(?:cpf|cnpj|rg)\\s*n[°º]?\\s*\\d{3}',
    isEnabled: false,
  },
  {
    name: 'foreign_spam',
    description: 'Texto predominantemente em idioma diferente do português',
    // Detecta combinações de palavras comuns em inglês/espanhol sem equivalente PT
    pattern:
      '\\b(?:click here|buy now|sign up|free money|make money|earn cash|crypto investment|double your|guaranteed profit|limited offer|act now|don\'t miss|exclusive deal|make profit)\\b',
    isEnabled: false,
  },
]

export async function seedContentModerationRules(): Promise<void> {
  console.log('[seed] Inserindo regras de moderação de conteúdo...')

  for (const rule of RULES) {
    await prisma.contentModerationRule.upsert({
      where: { name: rule.name },
      create: rule,
      update: {
        description: rule.description,
        pattern: rule.pattern,
        // Não sobrescrever isEnabled em updates — respeitar configuração existente
      },
    })
    console.log(`  ✓ ${rule.name}`)
  }

  console.log('[seed] Regras de moderação de conteúdo inseridas com sucesso.')
}

// Executar se chamado diretamente
if (require.main === module) {
  seedContentModerationRules()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
}
