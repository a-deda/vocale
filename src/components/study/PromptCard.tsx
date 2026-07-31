import React from 'react';

/**
 * De taakkaart: woordsoort, de opdracht, en wat er van het antwoord verwacht
 * wordt. Alles boven het toetsenbord, want daaronder scrollt niets.
 */
export default function PromptCard({
  label, requirement, children,
}: {
  label:        string;
  requirement?: string;
  children:     React.ReactNode;
}) {
  return (
    <div className="rounded-card bg-card px-5 py-[22px]">
      <div className="mb-3 text-[12px] font-medium tracking-[0.02em] text-ink-weak">{label}</div>
      {children}
      {requirement && <div className="mt-[10px] text-[13px] text-ink-weak">{requirement}</div>}
    </div>
  );
}

const ITALIAN_ARTICLES = ['il ', 'lo ', 'la ', "l'", 'i ', 'gli ', 'le '];

/** Verwacht het antwoord een lidwoord? Dat staat in het opgeslagen woord zelf. */
export function requiresArticle(original: string): boolean {
  const lower = original.trim().toLowerCase();
  return ITALIAN_ARTICLES.some(article => lower.startsWith(article));
}
