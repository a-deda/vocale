
## Plan: Streak Freeze Systeem

### Concept
Gebruikers verdienen "streak freezes" door consistent te studeren. Een freeze wordt automatisch ingezet als ze een dag missen, zodat de streak doorloopt.

### Voorgesteld systeem (Duolingo-geïnspireerd, maar aangepast)

**Verdienen:**
- Elke 10 dagen aaneengesloten streak → +1 freeze verdiend
- Maximum van 3 freezes tegelijk (voorkomt eindeloos hamsteren)

**Inzet:**
- Automatisch bij detectie van een gemiste dag (wanneer gebruiker terugkomt en `lastStudyDate` = 2 dagen geleden)
- Streak blijft intact, freeze count -1
- Notificatie/toast: "Streak freeze gebruikt! Je hebt nog X over."

**Zichtbaarheid:**
- Badge naast streak op Dashboard, TopBar en DesktopSidebar (bijv. ❄️ × 2)
- Op Stats-pagina: uitleg + history van gebruikte freezes (optioneel)

### Alternatieven overwogen
1. **Vaste hoeveelheid per maand** — minder motiverend, beloont consistentie niet
2. **Aankoop met "punten"** — vereist puntensysteem, te complex voor nu
3. **Weekend-pas** — minder flexibel dan freezes

→ **Gekozen**: 1 freeze per 10 dagen, max 3. Simpel, eerlijk, motiveert lange streaks.

### Wijzigingen

**1. Database (`supabase/migrations/`)**
Nieuwe kolommen op `user_stats`:
- `streak_freezes` (int, default 0) — huidig aantal beschikbare freezes
- `freezes_earned_at_streak` (int, default 0) — laatste streak-mijlpaal waarop freeze verdiend is (voorkomt dubbele uitgifte)

**2. `src/types/word.ts`**
`UserStats` uitbreiden met `streakFreezes` en `freezesEarnedAtStreak`.

**3. `src/lib/store.ts`**
- `dbToStats` mapping uitbreiden
- `updateStats` field-mapping uitbreiden
- `updateStreak` logica aanpassen:
  - Bij 2 dagen gat én freezes > 0 → freeze inzetten, streak doorzetten, toast tonen
  - Bij elke nieuwe streak-mijlpaal van 10 (en hoger dan `freezesEarnedAtStreak`) → freeze toevoegen (max 3), toast tonen

**4. UI updates**
- `src/components/BottomNav.tsx` (TopBar) → freeze badge naast streak
- `src/components/DesktopSidebar.tsx` → freeze badge
- `src/pages/Dashboard.tsx` → freeze count zichtbaar bij streak-kaart, korte uitleg
- `src/pages/Stats.tsx` → uitleg-blokje "❄️ Streak Freezes: verdien er 1 per 10 dagen, max 3"

### Edge cases
- Gat van 2+ dagen met 1 freeze: 1 freeze gebruikt, streak +1 (alsof gisteren gestudeerd)
- Gat van 3+ dagen met meerdere freezes: voor nu → slechts 1 freeze inzetten, streak resetten als gat > 2 dagen. (Eenvoudig houden; multi-day freeze kan later)
- Geen freezes + gat: streak reset zoals nu

### Geen vragen nodig
Voorstel is concreet; gebruiker zei "open voor suggesties" en ik kies de eerlijkste/eenvoudigste variant.
