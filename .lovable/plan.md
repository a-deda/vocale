

## Plan: Meerdere Vertalingen per Woord

### Concept
Het `translation` veld wordt een semikolon-gescheiden lijst (bijv. `"langzaam; zachtjes"`). Bij het toevoegen van een duplicaat wordt de nieuwe vertaling samengevoegd met de bestaande.

### Wijzigingen

**1. `src/pages/WordBank.tsx` — Duplicaatdetectie → samenvoegen**
- Als een woord al bestaat en de nieuwe vertaling verschilt: voeg de vertaling toe aan het bestaande woord via `updateWord(id, { translation: "bestaand; nieuw" })`.
- Toon een toast: "Vertaling toegevoegd aan [woord]".
- Als de vertaling identiek is: skip zoals nu.

**2. `src/lib/srs.ts` — `fuzzyMatch` multi-vertaling**
- Split `correct` op `";"` en match de input tegen elke vertaling apart.
- Beste resultaat wint (correct > almost > wrong).

**3. `src/lib/srs.ts` — `generateMCOptions`**
- Bij MC-opties: toon de eerste vertaling als label (of alle, gescheiden door " / ").

**4. `src/components/study/ProductionCard.tsx` + andere kaarten**
- Bij het tonen van de vertaling (hint/feedback): toon alle vertalingen gescheiden door " / ".

**5. `src/pages/WordBank.tsx` — Weergave**
- Woordkaarten tonen alle vertalingen netjes onder elkaar of met " / " gescheiden.

### Geen DB-wijziging nodig
Het `translation` veld is al een `text` kolom — semikolon-gescheiden waarden passen erin zonder schemawijziging.

