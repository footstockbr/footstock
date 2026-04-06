"use client";

import { useState, useMemo } from "react";
import { BookOpen, Search } from "lucide-react";
import { GLOSSARY_TERMS } from "@/lib/data/glossary";

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
    <div className="px-4 pt-4">
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
              <TermCard key={item.slug} title={item.title} definition={item.definition} />
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
                  <TermCard key={item.slug} title={item.title} definition={item.definition} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TermCard({ title, definition }: { title: string; definition: string }) {
  return (
    <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-4">
      <p className="text-sm font-semibold text-[#F0B90B] mb-1">{title}</p>
      <p className="text-sm text-[#929AA5] leading-relaxed">{definition}</p>
    </div>
  );
}
