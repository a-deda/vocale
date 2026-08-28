# Vocale

Woordenschat-leerapp gebouwd met React, Vite, Supabase en Tailwind CSS. Origineel aangemaakt via Lovable.

## Lokaal draaien

### Vereisten

- Node.js
- Een eigen Supabase project (los van Lovable's instantie)

### 1. Supabase project aanmaken

Maak een nieuw project aan op [supabase.com](https://supabase.com).

### 2. Google OAuth instellen

**In Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):

1. Maak een project aan
2. Ga naar **APIs & Services → OAuth consent screen** → kies External → vul naam en e-mail in
3. Ga naar **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: Web application
   - Authorized redirect URIs: `https://<jouw-supabase-project-id>.supabase.co/auth/v1/callback`
4. Kopieer de **Client ID** en **Client Secret**

**In Supabase dashboard:**

1. Ga naar **Authentication → Providers → Google**
2. Zet Google aan en voer de Client ID en Secret in
3. Ga naar **Authentication → URL Configuration → Redirect URLs**
4. Voeg toe: `http://localhost:5173`

### 3. Databasetabellen aanmaken

Importeer je tabellen via **Table Editor → Import data from CSV**.

Volgorde bij foreign keys: importeer parent-tabellen eerst.

Voer daarna in de **SQL Editor** de benodigde rechten en RLS-policies in:

```sql
-- Rechten voor ingelogde gebruikers
GRANT ALL ON words TO authenticated;
GRANT ALL ON user_stats TO authenticated;
GRANT ALL ON study_sessions TO authenticated;
GRANT ALL ON profiles TO authenticated;

-- RLS policies (let op: user_id is opgeslagen als text)
CREATE POLICY "Users can read own data" ON words          FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can read own data" ON profiles       FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can read own data" ON study_sessions FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can read own data" ON user_stats     FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can write own data" ON words          FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users can write own data" ON profiles       FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users can write own data" ON study_sessions FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users can write own data" ON user_stats     FOR ALL USING (auth.uid()::text = user_id);
```

### 3b. Grens op het aantal rijen per verzoek

De REST-API van Supabase geeft per verzoek hooguit `max-rows` rijen terug
(**Settings → API → Max rows**, standaard 1000) en meldt dat niet: je krijgt een
volle array en geen fout.

Elke tabel die met het gebruik meegroeit wordt daarom in pagina's gelezen, via
`fetchAll` in `src/lib/fetch-all.ts` — met een vaste sortering, want zonder
`ORDER BY` kan paginering rijen dubbel of niet teruggeven. Voeg je een query toe
op `words`, `card_fsrs_states`, `study_sessions` of `review_logs`, gebruik die
helper dan ook.

Waarom dit strak moet: zonder sortering levert Postgres de rijen ruwweg in
fysieke volgorde, en een bijgewerkte rij schuift naar achteren. Uitgerekend de
zojuist beoordeelde woorden vielen zo buiten het antwoord, laadden zonder
voortgang, en verloren bij de volgende beurt hun opgebouwde geschiedenis.

### 4. User ID's bijwerken (bij data-migratie)

Als je data uit Lovable's Supabase hebt geëxporteerd, staan er oude user_id's in. Vervang ze via de SQL Editor:

```sql
UPDATE profiles          SET user_id = '<nieuw-id>' WHERE user_id = '<oud-id>';
UPDATE study_sessions    SET user_id = '<nieuw-id>' WHERE user_id = '<oud-id>';
UPDATE user_stats        SET user_id = '<nieuw-id>' WHERE user_id = '<oud-id>';
UPDATE words             SET user_id = '<nieuw-id>' WHERE user_id = '<oud-id>';
UPDATE card_fsrs_states  SET user_id = '<nieuw-id>' WHERE user_id = '<oud-id>';
UPDATE review_logs       SET user_id = '<nieuw-id>' WHERE user_id = '<oud-id>';
```

Je nieuwe user ID vind je in **Authentication → Users** na de eerste login.

> **Sla `card_fsrs_states` en `review_logs` niet over.** Die twee tabellen stonden
> hier lang niet bij, en dat had een vervelend gevolg. Blijft er een oud user_id
> in staan, dan is de rij onzichtbaar voor `SELECT` (de RLS-policy vergelijkt met
> `auth.uid()::text`) maar bezet hij nog wél de sleutel `(card_id, mode)`. Een
> nieuwe beoordeling valt dan in de conflict-tak van de upsert, raakt nul rijen
> en meldt géén fout. Gevolg: het scherm zegt dat een woord over drie dagen
> terugkomt, en de volgende dag is die planning weg en begint het woord opnieuw.
>
> Controleer of er zulke rijen zijn:
>
> ```sql
> SELECT count(*) FROM card_fsrs_states cfs
> JOIN words w ON w.id::text = cfs.card_id
> WHERE cfs.user_id IS DISTINCT FROM w.user_id::text;
> ```
>
> Staat daar niet nul, draai dan
> `supabase/migrations/20260822000000_repair_fsrs_ownership.sql`.

### 5. Omgevingsvariabelen instellen

Maak een `.env` aan in de root van het project:

```
VITE_SUPABASE_URL=https://<jouw-project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<jouw-anon-key>
```

De URL en key vind je in **Project Settings → API**.

### 6. App starten

```bash
npm install
npm run dev
```

De app draait op [http://localhost:5173](http://localhost:5173).
