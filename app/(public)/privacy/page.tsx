import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politica de Privacidade | Foot Stock',
  description: 'Politica de privacidade e protecao de dados do Foot Stock.',
}

export default function PrivacyPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <h1 className="text-2xl font-bold text-text-primary">Politica de Privacidade</h1>
      <p className="text-sm text-text-muted">Ultima atualizacao: Março 2026</p>

      <section className="mt-8 space-y-4 text-text-secondary">
        <h2 className="text-lg font-semibold text-text-primary">1. Coleta de Dados</h2>
        <p>
          O Foot Stock coleta dados pessoais necessarios para a operacao da plataforma,
          incluindo: nome completo, e-mail, telefone, CPF (armazenado de forma criptografada),
          data de nascimento e clube favorito.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">2. Uso dos Dados</h2>
        <p>
          Seus dados sao utilizados para: identificacao e autenticacao, operacoes na plataforma,
          comunicacoes sobre sua conta, e cumprimento de obrigacoes legais.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">3. Base Legal (LGPD)</h2>
        <p>
          O tratamento dos seus dados pessoais e realizado com base no seu consentimento
          (Art. 7, I da LGPD), na execucao de contrato (Art. 7, V) e no cumprimento de
          obrigacao legal (Art. 7, II).
        </p>

        <h2 className="text-lg font-semibold text-text-primary">4. Seus Direitos</h2>
        <p>
          Conforme a LGPD (Lei 13.709/2018), voce tem direito a: acessar seus dados,
          corrigi-los, solicitar anonimizacao, portabilidade, eliminacao de dados
          desnecessarios e revogar seu consentimento a qualquer momento.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">5. Seguranca</h2>
        <p>
          Adotamos medidas tecnicas e organizacionais para proteger seus dados,
          incluindo criptografia SHA-256 para dados sensiveis (CPF), verificacao
          de idade via servico externo (FlagCheck) e rate limiting para prevencao
          de abusos.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">6. Cookies e Analytics</h2>
        <p>
          Utilizamos cookies essenciais para funcionamento da plataforma. Cookies
          analiticos e de marketing sao opcionais e dependem do seu consentimento
          explicito durante o cadastro.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">7. Contato</h2>
        <p>
          Para exercer seus direitos ou esclarecer duvidas, entre em contato pelo
          e-mail: <span className="text-accent">privacidade@footstock.com.br</span>
        </p>

        <h2 className="text-lg font-semibold text-text-primary">8. Encarregado de Proteção de Dados (DPO)</h2>
        <p>
          Conforme o Art. 41 da LGPD (Lei 13.709/2018), o Foot Stock designou um Encarregado
          de Proteção de Dados (DPO) responsavel por atuar como canal de comunicacao entre
          a empresa, os titulares de dados e a Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
        <p>
          <strong>Encarregado de Dados — Foot Stock</strong>
          <br />
          E-mail:{' '}
          <span className="text-accent">dpo@footstock.com.br</span>
        </p>
        <p>
          Em caso de incidente de segurança envolvendo dados pessoais, o Foot Stock notificara
          a ANPD no prazo de 72 horas a partir da detecção, conforme Art. 48 da LGPD e a
          Resolução CD/ANPD nº 2/2022.
        </p>
      </section>
    </article>
  )
}
