
De Stats-pagina toont nu grotendeels placeholder/mock data (de "Leercurve" grafiek is hardcoded `[15, 25, 35, 50, 65, 45, 70]`). Ik ga deze vervangen door echte data uit `words` en `sessions`, en nieuwe inzichten toevoegen die waardevol zijn voor een taalleerder.

## Plan: Echte Statistieken + Nieuwe Inzichten

### 1. Vervangen: Leercurve met echte data
De huidige hardcoded maand-grafiek wordt een **echte 30-dagen activiteitsgrafiek** op basis van `sessions`:
- X-as: laatste 30 dagen
- Y-as: aantal woorden gestudeerd per dag
- Vandaag gehighlight in accent-kleur

### 2. Nieuwe inzichten (4 nieuwe kaarten)

**a. Beheersingsverdeling** (donut/staafjes)
Verdeling van woorden over status: nieuw / aan het leren / herhaling / stabiel. Geeft direct beeld van waar je staat.

**b. Nauwkeurigheid laatste 7 dagen**
Percentage correcte antwoorden uit recente sessies (`correct / (correct + incorrect)`). Toont of je écht beter wordt, niet alleen meer doet.

**c. Lastigste woorden** (top 5)
Woorden met hoogste `consecutiveErrors` of laagste mastery score. Direct inzicht in waar focus nodig is, met klikbare link naar woordenbank.

**d. Studietijd totaal & gemiddeld**
- Totale studietijd (som van `session.duration`)
- Gemiddelde sessieduur
- Gemiddeld aantal woorden per sessie

### 3. Verbeteren: bestaande "Recente Activiteit"
Toevoegen: nauwkeurigheid per sessie (% correct) inline.

### 4. Verbeteren: Categorieën
Reeds echt — laten staan, eventueel sorteren op aantal (al gedaan via `slice(0,5)` maar zonder sort). Voeg sortering toe.

### Technische details
- Eén bestand: `src/pages/Stats.tsx`
- Alle berekeningen via `useMemo` op `words` en `sessions`
- Geen DB-wijzigingen nodig — alle benodigde velden bestaan al (`sessions.correct/incorrect/duration/wordsStudied/date`, `words.consecutiveErrors/status/category`)
- Importeer `getMasteryScore` uit `@/lib/srs` voor lastigste woorden
- Gebruik bestaande `glass-card` styling en kleurtokens (geen nieuwe design tokens)

### Layout
```text
[Top stats grid 2x2 — bestaand, behouden]
[30-dagen activiteit — vervangen]
[Beheersingsverdeling | Nauwkeurigheid 7d]  ← nieuw, naast elkaar md+
[Lastigste woorden — nieuw]
[Studietijd kaart — nieuw]
[Categorieën — bestaand, met sortering]
[Recente activiteit — bestaand, met % correct]
```

Empty state blijft behouden voor wanneer er nog geen woorden/sessies zijn.
