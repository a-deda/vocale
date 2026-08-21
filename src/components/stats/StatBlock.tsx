import React from 'react';
import { Label } from '@/components/vocale/Primitives';

/**
 * Eén kaart op het statistiekenscherm: kleinletterlabel, dan de inhoud.
 *
 * Elk blok is even breed en heeft dezelfde binnenmaat, zodat de pagina één
 * kolom blijft in plaats van een raster van tegels — het designsysteem verbiedt
 * identieke kaartrasters.
 */
export function StatBlock({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 rounded-card bg-card p-5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/**
 * Wat een blok zegt als het nog niets te tonen heeft: één zin die de stand
 * beschrijft, en één die zegt wanneer het zich vult. Geen aanmoediging, in de
 * toon van het overzicht ("Niets vervalt vandaag.").
 */
export function EmptyNote({ title, body }: { title: string; body?: string }) {
  return (
    <div className="grid gap-2">
      <p className="text-[16px] leading-[1.35] text-ink">{title}</p>
      {body && (
        <p className="text-pretty text-[13px] leading-[1.45] text-ink-weak">{body}</p>
      )}
    </div>
  );
}
