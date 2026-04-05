import { Info } from 'lucide-react'

interface InfoTipProps {
  text: string
}

/**
 * Inline Info icon with native tooltip.
 * Pattern: <span title="..."><Info /></span>
 */
export function InfoTip({ text }: InfoTipProps) {
  return (
    <span title={text} aria-label={text} className="cursor-help inline-flex">
      <Info className="w-3 h-3 text-[#707A8A]" />
    </span>
  )
}
