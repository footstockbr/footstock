'use client'

export default function AssetDetailError({
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-4">
      <h2 className="text-lg font-bold text-[#F0EAD6]">Erro ao carregar ativo</h2>
      <p className="text-sm text-[#7a7060] text-center">
        Ocorreu um erro interno. Por favor, tente novamente.
      </p>
      <button
        onClick={reset}
        data-testid="error-retry-btn"
        className="bg-[#C9A84C] text-[#080808] px-4 py-2 rounded-lg font-semibold"
      >
        Tentar novamente
      </button>
    </div>
  )
}
