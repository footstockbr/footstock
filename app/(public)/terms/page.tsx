import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso | Foot Stock',
  description: 'Termos de uso da plataforma Foot Stock. FS$ é moeda virtual educacional sem valor monetário real.',
}

export default function TermsPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <h1 className="text-2xl font-bold text-text-primary">Termos de Uso</h1>
      <p className="text-sm text-text-muted">Ultima atualizacao: Março 2026</p>

      {/* Educational disclaimer banner */}
      <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <p className="text-sm font-semibold text-amber-400">Aviso Educacional</p>
        <p className="mt-1 text-sm text-text-secondary">
          O Foot Stock é uma plataforma exclusivamente educacional de simulação de mercado de capitais temático de futebol.
          A moeda virtual FS$ (Foot Stock Dollar) <strong className="text-text-primary">não possui valor monetário real</strong>, não pode ser convertida em dinheiro,
          não representa qualquer ativo financeiro regulado e não configura investimento, jogo ou aposta.
          Toda operação realizada na plataforma é fictícia e serve apenas para fins de aprendizado e entretenimento.
        </p>
      </div>

      <section className="mt-8 space-y-4 text-text-secondary">
        <h2 className="text-lg font-semibold text-text-primary">1. Aceitacao</h2>
        <p>
          Ao criar uma conta no Foot Stock, voce declara ter lido, compreendido e
          concordado com estes Termos de Uso. O uso da plataforma esta condicionado
          a aceitacao integral destes termos.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">2. Elegibilidade</h2>
        <p>
          Para utilizar o Foot Stock voce deve: ter no minimo 18 anos de idade,
          possuir CPF valido e residir no territorio brasileiro. A verificacao de
          idade e realizada durante o cadastro.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">3. Natureza da Plataforma e da Moeda Virtual (FS$)</h2>
        <p>
          O Foot Stock é uma plataforma de simulação educacional de mercado de ações temáticas
          de futebol. As operações são realizadas exclusivamente com a moeda virtual FS$ (Foot Stock Dollar),
          que <strong className="text-text-primary">não possui valor monetário real</strong> e não pode ser trocada,
          vendida, transferida ou convertida em dinheiro ou qualquer bem tangível.
        </p>
        <p>
          O FS$ é concedido gratuitamente como saldo simulado para fins educacionais. A plataforma não
          constitui corretora de valores, casa de câmbio, operadora de jogos ou qualquer entidade financeira
          regulada. O uso da plataforma não gera direitos patrimoniais de qualquer natureza.
        </p>
        <p>
          Ao utilizar o Foot Stock, o usuário declara expressamente compreender que todas as operações,
          lucros, perdas e saldos exibidos são fictícios e existem apenas para fins de aprendizado sobre
          dinâmicas de mercado financeiro.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">4. Conta do Usuario</h2>
        <p>
          Voce e responsavel por manter a seguranca de sua conta, incluindo senha
          e dados de acesso. Cada CPF pode ter apenas uma conta. Contas duplicadas
          serao encerradas.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">5. Conduta</h2>
        <p>
          E proibido: manipular o mercado simulado, criar contas falsas, utilizar
          bots ou automacoes nao autorizadas, e qualquer conduta que prejudique
          outros usuarios ou a integridade da plataforma.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">6. Propriedade Intelectual</h2>
        <p>
          Todo o conteudo da plataforma, incluindo nomes ficticios de clubes,
          design e logica do sistema, e de propriedade do Foot Stock. Os nomes
          reais dos clubes sao utilizados apenas na tela de selecao durante o
          cadastro.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">7. Modificacoes</h2>
        <p>
          O Foot Stock reserva-se o direito de modificar estes termos a qualquer
          momento. Alteracoes significativas serao comunicadas por e-mail ou
          notificacao na plataforma.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">8. Isenção de Responsabilidade Financeira</h2>
        <p>
          O Foot Stock não se responsabiliza por decisões financeiras reais tomadas com base em
          experiências ou aprendizados obtidos na plataforma. As cotações e dinâmicas de mercado
          simuladas são fictícias e não refletem, necessariamente, o comportamento de mercados
          financeiros reais. O uso da plataforma não substitui orientação profissional de um
          assessor de investimentos habilitado.
        </p>
      </section>
    </article>
  )
}
