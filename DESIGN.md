---
name: Lexis
description: A language learning app where one word, one screen, one clear action is the rule.
colors:
  signal-indigo: "#8b47eb"
  mind-teal: "#26d9d9"
  ember-streak: "#f48525"
  night-canvas: "#0e0e11"
  ink-surface: "#17171c"
  surface-dim: "#26262b"
  iron-border: "#2b2b31"
  pale-light: "#f2f2f2"
  mist-text: "#868692"
  spring-green: "#2eb873"
  amber-mark: "#f4af25"
  error-red: "#dd3c3c"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "clamp(1.875rem, 5vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    letterSpacing: "0.08em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-indigo}"
    textColor: "{colors.pale-light}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.mist-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  input-study:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.pale-light}"
    rounded: "{rounded.xl}"
    padding: "14px 16px"
  input-default:
    backgroundColor: "{colors.night-canvas}"
    textColor: "{colors.pale-light}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  card-default:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.pale-light}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Lexis

## 1. Overview

**Creative North Star: "The Capable Companion"**

Lexis is the app that earns your trust by staying out of your way. The interface is dark and focused: a learner on the metro, phone in hand, running through Italian words before work. The screen glows softly in dim ambient light. Everything unnecessary has been stripped. One word, one action, one result.

The system earns confidence through precision, not drama. Signal Indigo — the one chromatic voice — appears sparingly: on primary action buttons, focus rings, the floating study CTA. It never competes with itself. The rest of the palette is tonal dark: near-blacks and deep charcoals with a faint blue undertone, keeping the eye rested and the word in focus.

This system explicitly rejects the clutter of tools like Anki, the gratuitous celebration of XP-explosion apps, and the information density of enterprise dashboards. Every screen has one clear primary action, and that action is impossible to miss.

**Key Characteristics:**
- Dark, focused, deliberately spacious
- One chromatic voice (Signal Indigo); supporting colors appear only in their semantic contexts
- Space communicates quality: generous padding signals that each element matters
- Two-font pairing — Space Grotesk for structure, Manrope for content — precision with human warmth
- Motion is responsive to state, never decorative

## 2. Colors: The Night Studio Palette

A restrained dark palette anchored in deep blue-grey, with Signal Indigo as the only chromatic voice. Supporting hues appear exclusively in semantic contexts (feedback states, streak momentum).

### Primary
- **Signal Indigo** (`#8b47eb`): The one chromatic voice. Used on primary buttons, focus rings, active nav states, and the floating study CTA. Its implementation uses a gradient (`hsl(265 80% 60%) → hsl(280 70% 50%)`) on buttons and the CTA pill; solid at full saturation for focus rings and active state dots. Its rarity is the point — when Signal Indigo appears, something matters.

### Secondary
- **Mind Teal** (`#26d9d9`): Secondary accent for `outline` button hover states and the `ghost` variant hover fill. Appears at low frequency; never on the same surface as Signal Indigo simultaneously.

### Tertiary
- **Ember Streak** (`#f48525`): The momentum color. Appears only on the streak badge when the user has studied today, with a layered drop-shadow glow that reads as lit from within. Cold when the streak is idle. Contextual, earned, celebratory without volume.

### Neutral
- **Night Canvas** (`#0e0e11`): Page background. Near-black with the faintest blue-indigo undertone — not pure black.
- **Ink Surface** (`#17171c`): Card and popover backgrounds. One stop lighter than Night Canvas; defines a surface without competing.
- **Surface Dim** (`#26262b`): Secondary container backgrounds. Chip backgrounds, collapsed sidebar items, inactive segment panels.
- **Iron Border** (`#2b2b31`): All structural borders and dividers. Barely visible against Ink Surface — structure without shout.
- **Pale Light** (`#f2f2f2`): Primary text. Not pure white; the faint warmth reduces eye strain on long study sessions.
- **Mist Text** (`#868692`): Secondary text, placeholders, contextual labels, inactive nav items.

### Semantic
- **Spring Green** (`#2eb873`): Correct answer feedback. Full opacity on icon and label; 10% tinted background.
- **Amber Mark** (`#f4af25`): Near-miss / "almost" feedback. Same treatment.
- **Error Red** (`#dd3c3c`): Wrong answer and destructive actions. Same treatment.

### Named Rules

**The One Voice Rule.** Signal Indigo appears on at most one primary surface per screen. The gradient button and the floating CTA never coexist at full opacity on the same screen. The solid variant (focus ring, active nav dot) is the second permitted use. That is the budget.

**The Semantic-Only Rule.** Spring Green, Amber Mark, and Error Red are feedback states. Never use them as decorative accents, labels, or background tints outside answer-result and status contexts.

## 3. Typography

**Display Font:** Space Grotesk (with `sans-serif` fallback)
**Body Font:** Manrope (with `sans-serif` fallback)

**Character:** Space Grotesk brings geometric precision and intentional sharpness to headings — the word on screen feels definite, unambiguous. Manrope brings warmth and legibility to interface copy and body text: approachable without being casual. The pairing communicates "built by people who care, not a committee." Both are set with `antialiased` at the body level for crispness on dark backgrounds.

### Hierarchy
- **Display** (Space Grotesk, 700, `clamp(1.875rem, 5vw, 2.25rem)`, line-height 1.1, letter-spacing -0.02em): The word under study. Appears once per screen, at the center of a study card. Commands the full visual weight of the page.
- **Headline** (Space Grotesk, 600, 1.5rem, line-height 1.2, letter-spacing -0.02em): Section headings, card titles, word list items.
- **Body** (Manrope, 400, 1rem / 0.875rem on small screens, line-height 1.5): Interface copy, descriptions, supporting text. Line length capped at 65ch on multi-sentence runs.
- **Label** (Manrope, 500, 0.625rem, letter-spacing 0.08em, uppercase): Contextual prompts inside study cards ("Vertaal naar het Italiaans", "Correcte spelling"). Always all-caps. Always verify contrast at this size.

### Named Rules

**The Single-Word Rule.** Display-scale type (≥1.875rem, Space Grotesk 700) exists for the word being studied, and nothing else. Navigation labels, statistics, headings, and marketing copy are never display-scale.

## 4. Elevation

Lexis uses **tonal layering** as its primary depth signal, with selective glass-blur reserved for floating focus surfaces. Decorative shadows are prohibited.

The three tonal steps define the full depth stack: Night Canvas (page) → Ink Surface (cards, modals) → Surface Dim (nested containers, active chips). This is sufficient hierarchy without any shadow.

The `glass-card` pattern (`bg-card/80 backdrop-blur-xl`) is reserved for the study prompt container and feedback panels — surfaces that need to feel separated from the surrounding UI and demand full attention. It is not a default card style. Standard cards (word lists, settings rows, stats panels) use solid Ink Surface.

### Shadow Vocabulary
- **Structural Float** (`0 4px 16px hsl(265 80% 60% / 0.30)`, brightens to `0 8px 24px hsl(265 80% 60% / 0.40)` on hover): Used only on the floating study CTA in the bottom nav. The indigo-tinted shadow reinforces the Signal Indigo brand and signals the elevated affordance.
- **Ambient Low** (`0 1px 3px rgba(0, 0, 0, 0.40)`): Cards at rest against Night Canvas. Minimal lift — present but imperceptible at a glance.

### Named Rules

**The Glass-By-Exception Rule.** `backdrop-filter: blur` appears on the study card container and the top/bottom navigation bars only. Every additional surface that receives it dilutes the signal. Glass communicates "focused attention surface"; when everything is glass, nothing is.

## 5. Components

### Buttons
Confident and direct. Shape and color communicate affordance without ambiguity.

- **Shape:** 10px radius — gently curved, reads clearly as a button, not a tag.
- **Primary:** Signal Indigo gradient (`hsl(265 80% 60%) → hsl(280 70% 50%)`), Pale Light text, 40px height, 16px horizontal padding. On hover: 90% opacity. Focus-visible: 2px Signal Indigo ring with 2px offset. No transform or bounce.
- **Ghost:** Transparent background, Mist Text label. On hover: Surface Dim background, Pale Light text. Used for secondary actions ("Ik weet het niet", skip affordances).
- **Destructive-context:** `bg-destructive/10`, Iron Border-weight border in Error Red at 30% opacity, Error Red text. Used for skip/give-up actions in the study flow — not dangerous, but a step backwards.

### Cards / Containers
Two treatments, non-interchangeable.

- **Standard Card:** Ink Surface background, Iron Border (1px), 12px radius, ambient-low shadow, 24px all-side padding. Used for word list items, settings rows, stat panels.
- **Glass Card:** Ink Surface at 80% opacity, `backdrop-blur-xl` (24px blur), Iron Border at 50% opacity, 16px–24px radius, 32px padding. Used for the study prompt surface and answer feedback panels.
- Nested cards are never correct. A glass card inside a standard card, or any card inside a card, is prohibited.

### Inputs / Fields
- **Study Input:** Ink Surface background, Iron Border (1px), 12px radius, 18px centered text, 14px vertical padding. Focus: border shifts to Signal Indigo at 50% opacity, soft `box-shadow` ring at 20% opacity. The dominant interactive element on the screen when active.
- **Standard Input:** Night Canvas background, Iron Border (1px), 10px radius, 40px height, 14px Manrope. Focus: 2px Signal Indigo ring at 25% opacity.
- Placeholder text: Mist Text at 50% opacity across both variants.

### Navigation
- **Bottom Nav (mobile):** Night Canvas at 95% opacity, `backdrop-blur-lg`, Iron Border top divider, 8px vertical padding. Icon + 10px label. Mist Text at rest, Signal Indigo on active item.
- **Floating Study CTA:** 48px circle, Signal Indigo gradient, white icon, `-20px` top-margin lift above the nav bar. Structural Float shadow. The most visually prominent element in the nav — intentionally.
- **Active state:** Color shift only to Signal Indigo. No underlines, no side stripes, no background pills.
- **Desktop Sidebar:** Slightly darker than Night Canvas (`hsl(240 10% 8%)`). Same active/rest color logic as bottom nav.

### Streak Badge
A signature component. Cold state: Surface Dim background, Mist Text flame icon, white count. Active state (studied today): Ember Streak at 15% tinted background, Ember Streak flame icon with a two-layer drop-shadow glow. The state change is the reward — no additional animation needed.

## 6. Do's and Don'ts

### Do:
- **Do** use Signal Indigo for one primary action per screen. If two actions compete for the indigo budget, one must be ghost or secondary.
- **Do** reserve the glass-card treatment for the study focus surface only. Every other surface uses solid Ink Surface.
- **Do** use label type (0.625rem, uppercase, letter-spacing 0.08em) for all contextual prompts inside study cards.
- **Do** keep the study input centered with 18px text — it is the user's primary point of attention on that screen.
- **Do** ensure every tap target is at minimum 44×44px on mobile.
- **Do** suppress `pulse-glow` and `streak-flame` animations when `prefers-reduced-motion: reduce` is active.
- **Do** reserve Ember Streak for the streak badge, and only when the user has studied today. Its appearance must be earned.
- **Do** communicate feedback (correct / almost / wrong) through background tint + icon + colored label — all three together.

### Don't:
- **Don't** build Anki-style density: no feature-list UI, no information overload on a screen that should have one primary task.
- **Don't** add gamification overdose: no confetti, XP explosion overlays, or full-screen reward animations. The streak badge is the ceiling of celebration.
- **Don't** use gradient text (`-webkit-background-clip: text` with a gradient fill). The `text-gradient-primary` utility in the codebase is a legacy pattern — replace with solid Signal Indigo. Gradient text degrades in forced-colors and high-contrast modes.
- **Don't** apply `glass-card` / `backdrop-blur` as a default surface treatment. If every card is glass, none of them signal focused attention.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on any element. Rewrite with a background tint or full-border treatment.
- **Don't** build identical card grids (same-sized cards with icon + heading + text in a repeat loop). Vary density and layout.
- **Don't** put multiple competing stat widgets on the first screen a user sees. The home screen has one call to action; statistics live in their own route.
- **Don't** use Mind Teal or Ember Streak as decorative accents outside their semantic roles.
