"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { BookOpen, Search, ChevronDown } from "lucide-react";
import { GLOSSARY_TERMS, type GlossaryTerm } from "@/lib/data/glossary";
import { useAnalytics } from "@/hooks/useAnalytics";

const CATEGORY_LABELS: Record<string, string> = {
  "indicadores-tecnicos": "Indicadores Tecnicos",
  "valuation-e-fundamentos": "Valuation e Fundamentos",
  "tipos-de-ordem": "Tipos de Ordem",
  "carteira-e-rentabilidade": "Carteira e Rentabilidade",
  "sentimento-e-analise": "Sentimento e Analise",
  "mercado-e-pregao": "Mercado e Pregao",
  "divisoes-e-clubes": "Divisoes e Clubes",
  "planos-e-funcionalidades": "Planos e Funcionalidades",
};

export default function GlossarioPage() {
  const [search, setSearch] = useState("");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const { track } = useAnalytics();
  const trackedCategoriesRef = useRef(new Set<string>());

  // EVT-030: glossary_term_viewed — rastreia abertura de termo via navegacao de termos relacionados
  const scrollToTerm = useCallback((slug: string) => {
    setSearch("");
    setExpandedSlug(slug);

    const term = GLOSSARY_TERMS.find((t) => t.slug === slug);
    if (term) {
      track("glossary_term_viewed", {
        term_id: term.slug,
        category: term.category,
        accessed_via: "glossary_screen",
        plan: "JOGADOR" as const,
      });
    }

    // Wait for DOM update after clearing search (re-renders grouped view)
    requestAnimationFrame(() => {
      const el = document.getElementById(`term-${slug}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, [track]);

  // Handler para toggle de termo com analytics
  const handleTermToggle = useCallback((term: GlossaryTerm) => {
    const isExpanding = expandedSlug !== term.slug;
    setExpandedSlug(expandedSlug === term.slug ? null : term.slug);

    if (isExpanding) {
      // EVT-030: glossary_term_viewed
      track("glossary_term_viewed", {
        term_id: term.slug,
        category: term.category,
        accessed_via: "glossary_screen",
        plan: "JOGADOR" as const,
      });

      // EVT-029: glossary_category_viewed — rastreia primeira interacao com categoria
      if (!trackedCategoriesRef.current.has(term.category)) {
        trackedCategoriesRef.current.add(term.category);
        track("glossary_category_viewed", {
          category: term.category,
          plan: "JOGADOR" as const,
        });
      }
    }
  }, [expandedSlug, track]);

  const query = search.trim().toLowerCase();

  const filteredTerms = useMemo(() => {
    if (!query) return null;
    return GLOSSARY_TERMS.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.definition.toLowerCase().includes(query)
    );
  }, [query]);

  const groupedTerms = useMemo(() => {
    if (query) return null;
    const groups = new Map<string, typeof GLOSSARY_TERMS>();
    for (const term of GLOSSARY_TERMS) {
      const cat = term.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(term);
    }
    return groups;
  }, [query]);

  return (
    <div data-testid="page-glossario" className="px-4 pt-4">
      <h1 className="text-lg font-bold text-[#EAECEF] mb-1 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-[#F0B90B]" />
        Glossario
      </h1>
      <p className="text-sm text-[#929AA5] mb-4">
        {GLOSSARY_TERMS.length} termos de mercado financeiro
      </p>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#707A8A]" />
        <input
          type="search"
          placeholder="Buscar termo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20] pl-9 pr-3 text-sm text-[#EAECEF] placeholder:text-[#707A8A] focus:outline-none focus:border-[rgba(240,185,11,.4)]"
        />
      </div>

      {/* Search active: flat filtered list */}
      {filteredTerms !== null && (
        <>
          <p className="text-xs text-[#707A8A] mb-3">
            {filteredTerms.length} resultado{filteredTerms.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-col gap-2">
            {filteredTerms.map((item) => (
              <TermCard
                key={item.slug}
                term={item}
                isExpanded={expandedSlug === item.slug}
                onToggle={() => handleTermToggle(item)}
                onNavigate={scrollToTerm}
              />
            ))}
            {filteredTerms.length === 0 && (
              <p className="text-sm text-[#929AA5] text-center py-8">
                Nenhum termo encontrado.
              </p>
            )}
          </div>
        </>
      )}

      {/* No search: grouped by category */}
      {groupedTerms !== null && (
        <div className="flex flex-col gap-6">
          {Array.from(groupedTerms.entries()).map(([category, terms]) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-[#EAECEF] mb-2 border-b border-[rgba(240,185,11,.12)] pb-1">
                {CATEGORY_LABELS[category] ?? category}
                <span className="text-xs text-[#707A8A] font-normal ml-2">({terms.length})</span>
              </h2>
              <div className="flex flex-col gap-2">
                {terms.map((item) => (
                  <TermCard
                    key={item.slug}
                    term={item}
                    isExpanded={expandedSlug === item.slug}
                    onToggle={() => handleTermToggle(item)}
                    onNavigate={scrollToTerm}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TermCard({
  term,
  isExpanded,
  onToggle,
  onNavigate,
}: {
  term: GlossaryTerm;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: (slug: string) => void;
}) {
  const hasDetails = (term.examples && term.examples.length > 0) || (term.relatedTerms && term.relatedTerms.length > 0);

  return (
    <div
      id={`term-${term.slug}`}
      className={`bg-[#1E2329] rounded-lg border p-4 transition-colors ${
        isExpanded ? "border-[rgba(240,185,11,.3)]" : "border-[rgba(240,185,11,.1)]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasDetails}
        className="w-full text-left flex items-center justify-between gap-2"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#F0B90B] mb-1">{term.title}</p>
          <p className="text-sm text-[#929AA5] leading-relaxed">{term.definition}</p>
        </div>
        {hasDetails && (
          <ChevronDown
            className={`w-4 h-4 text-[#707A8A] shrink-0 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        )}
      </button>

      {isExpanded && hasDetails && (
        <div className="mt-3 pt-3 border-t border-[rgba(240,185,11,.08)] space-y-3">
          {term.examples && term.examples.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#EAECEF] mb-1.5">Exemplos</p>
              <ul className="space-y-1">
                {term.examples.map((ex, i) => (
                  <li key={i} className="text-xs text-[#929AA5] flex items-start gap-1.5">
                    <span className="text-[#F0B90B] mt-0.5 shrink-0">-</span>
                    <span>{ex}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {term.relatedTerms && term.relatedTerms.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#EAECEF] mb-1.5">Termos relacionados</p>
              <div className="flex flex-wrap gap-1.5">
                {term.relatedTerms.map((slug) => {
                  const related = GLOSSARY_TERMS.find((t) => t.slug === slug);
                  if (!related) return null;
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => onNavigate(slug)}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(240,185,11,.08)] text-[#F0B90B] border border-[rgba(240,185,11,.2)] hover:bg-[rgba(240,185,11,.18)] transition-colors"
                    >
                      {related.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
