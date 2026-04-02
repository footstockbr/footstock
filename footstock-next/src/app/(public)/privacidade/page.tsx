import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — Foot Stock',
  description: 'Saiba como o Foot Stock coleta, usa e protege seus dados pessoais conforme a LGPD.',
}

export default function PrivacidadePage() {
  return (
    <article className="prose prose-invert max-w-none">
      <h1 className="text-2xl font-bold text-[#EAECEF] mb-2">Política de Privacidade</h1>
      <p className="text-xs text-[#929AA5] mb-8">Última atualização: março de 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[#F0B90B] mb-3">1. Quem somos</h2>
        <p className="text-sm text-[#929AA5] leading-relaxed">
          O Foot Stock é uma plataforma educacional de simulação financeira com temática esportiva.
          Operamos como controlador dos dados pessoais coletados em conformidade com a Lei Geral de
          Proteção de Dados (LGPD — Lei 13.709/2018) e o ECA Digital (Lei 14.790/2023).
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[#F0B90B] mb-3">2. Dados coletados</h2>
        <ul className="text-sm text-[#929AA5] leading-relaxed list-disc list-inside space-y-1">
          <li>Nome completo e data de nascimento</li>
          <li>Email e telefone</li>
          <li>CPF — armazenado apenas como hash SHA-256, nunca em texto claro</li>
          <li>Clube favorito e preferências de uso da plataforma</li>
          <li>Dados de uso, logs de acesso e analytics (com seu consentimento)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[#F0B90B] mb-3">3. Finalidade do tratamento</h2>
        <ul className="text-sm text-[#929AA5] leading-relaxed list-disc list-inside space-y-1">
          <li>Autenticação e segurança da conta</li>
          <li>Verificação de maioridade (ECA Digital — 18+ anos obrigatório)</li>
          <li>Prevenção de fraudes e múltiplos cadastros</li>
          <li>Comunicações transacionais e, com seu consentimento, marketing</li>
          <li>Melhoria da plataforma via analytics agregados</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[#F0B90B] mb-3">
          4. Seus direitos (Art. 18 LGPD)
        </h2>
        <ul className="text-sm text-[#929AA5] leading-relaxed list-disc list-inside space-y-1">
          <li>Confirmação da existência de tratamento</li>
          <li>Acesso, correção e portabilidade dos dados</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
          <li>Revogação do consentimento a qualquer momento</li>
          <li>Informação sobre compartilhamento com terceiros</li>
          <li>Revisão de decisões automatizadas</li>
        </ul>
        <p className="text-sm text-[#929AA5] mt-3">
          Para exercer seus direitos, entre em contato com nosso DPO:{' '}
          <a href="mailto:privacidade@footstock.com.br" className="text-[#F0B90B] underline">
            privacidade@footstock.com.br
          </a>
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[#F0B90B] mb-3">5. Retenção e exclusão</h2>
        <p className="text-sm text-[#929AA5] leading-relaxed">
          Mantemos seus dados enquanto sua conta estiver ativa. Após solicitação de exclusão,
          removemos os dados pessoais em até 30 dias, exceto os obrigados por lei (registros
          fiscais, logs de segurança por 6 meses).
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[#F0B90B] mb-3">6. Segurança</h2>
        <p className="text-sm text-[#929AA5] leading-relaxed">
          Utilizamos criptografia em trânsito (TLS 1.3) e em repouso. O CPF é armazenado
          exclusivamente como hash SHA-256 com salt, impossibilitando recuperação do dado original.
          Senhas são gerenciadas pelo Supabase Auth com bcrypt.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[#F0B90B] mb-3">7. Contato e DPO</h2>
        <p className="text-sm text-[#929AA5] leading-relaxed">
          Encarregado de Proteção de Dados (DPO):{' '}
          <a href="mailto:privacidade@footstock.com.br" className="text-[#F0B90B] underline">
            privacidade@footstock.com.br
          </a>
        </p>
      </section>
    </article>
  )
}
