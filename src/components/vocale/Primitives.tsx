import React from 'react';
import { cn } from '@/lib/utils';

/**
 * De vormtaal van Vocale, in één bestand: papier, kaart, knop, label, data.
 * Radius 22 voor elk vlak, pill voor elke knop, geen schaduw en geen rand —
 * scheiding komt van wit op alabast.
 */

export function Wordmark() {
  return <span className="text-[20px] font-bold tracking-[-0.04em] text-ink">vocale</span>;
}

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-card bg-card p-5 ${className}`}>{children}</div>;
}

/** Kleinletterlabel; het designsysteem verbiedt kapitalen. */
export function Label({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`text-[12.5px] font-medium tracking-[0.02em] text-ink-weak ${className}`}>
      {children}
    </div>
  );
}

/** Cijfers, intervallen en tijden — mono, altijd tabular. */
export function Data({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <span className={`font-mono text-[12.5px] text-ink-weak ${className}`}>{children}</span>;
}

/**
 * Italiaans zoals de app het toont. Nooit voor invoer, nooit onder 17px,
 * nooit op een gekleurd vlak.
 */
export function ItalianText({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <span className={`font-italian text-ink ${className}`}>{children}</span>;
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:   'bg-active text-ink active:bg-[#B98A1A]',
  secondary: 'bg-card text-ink active:bg-[#F1F0F1]',
  quiet:     'bg-card text-ink-weak active:bg-[#F1F0F1]',
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
>(({ variant = 'primary', className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    {...props}
    // cn() lost geen stijl op maar laat een meegegeven breedte of hoogte de
    // basis daadwerkelijk overschrijven; met string-concatenatie won `w-full`.
    className={cn(
      'h-14 w-full rounded-full text-[17px] font-semibold tracking-[-0.01em]',
      'transition-colors duration-[120ms] disabled:bg-steel disabled:text-ink-weak',
      BUTTON_VARIANTS[variant],
      className,
    )}
  />
));
Button.displayName = 'Button';

/** Tekstactie zonder vlak — het systeem kent maar vier glyphs, dus geen icoon. */
export function TextAction({ className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`text-[14px] text-ink-weak ${className}`} />;
}

/** Haarlijn tussen rijen in een lijst. De enige toegestane rand. */
export function Hairline({ className = '' }: { className?: string }) {
  return <div className={`h-px bg-[rgba(1,25,54,0.1)] ${className}`} />;
}

export function Row({
  className = '', last = false, children,
}: { className?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={
        `flex items-center justify-between py-[13px] ` +
        `${last ? '' : 'border-b border-[rgba(139,158,183,0.45)]'} ${className}`
      }
    >
      {children}
    </div>
  );
}

/** Het scherm zelf: alabast, één verticale scroll, niets vastgezet. */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="screen-safe-top screen-safe-bottom mx-auto w-full max-w-[420px] px-5">
        {children}
      </div>
    </div>
  );
}

export function ScreenHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <Wordmark />
      <button
        onClick={onMenu}
        aria-label="Menu"
        className="flex h-8 w-8 flex-col items-center justify-center gap-[3px] rounded-full bg-card"
      >
        <span className="h-[1.5px] w-[13px] bg-ink" />
        <span className="h-[1.5px] w-[13px] bg-ink" />
        <span className="h-[1.5px] w-[13px] bg-ink" />
      </button>
    </div>
  );
}

/**
 * Sessiekop: terug, wat je nu doet, en de teller. Geen voortgangsbalk —
 * `12 / 24` is genoeg. De fase erbij, want een herhaling en een nieuw woord
 * voelen hetzelfde terwijl ze dat niet zijn.
 */
export function SessionHeader({
  onBack, phase, position, total,
}: { onBack: () => void; phase?: 'herhalen' | 'nieuw'; position: number; total: number }) {
  return (
    <div className="mb-[22px] flex items-center justify-between">
      <button onClick={onBack} aria-label="Terug" className="text-[20px] leading-none text-ink">←</button>
      <Data className="text-[13px]">
        {phase ? `${phase} · ` : ''}{position} / {total}
      </Data>
    </div>
  );
}
