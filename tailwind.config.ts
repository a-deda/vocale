import type { Config } from "tailwindcss";

/**
 * Vocale palette. Four colours plus one derived grey; nothing decorative.
 * Steel is a fill colour only — as text on paper it is ~2.4:1 and fails AA,
 * so secondary text uses ink-weak instead.
 */
const paper = "#EBE9E9";
const sheet = "#FFFFFF";
const ink = "#011936";
const inkWeak = "#55637A";
const steel = "#8B9EB7";
const active = "#D19C1D";
const lapsed = "#E3170A";
const hairline = "rgba(139,158,183,0.45)";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
        italian: ["Newsreader", "Georgia", "serif"],
      },
      colors: {
        paper,
        ink: {
          DEFAULT: ink,
          weak: inkWeak,
        },
        steel,
        active,
        lapsed,
        /** An anchored word has become part of your language, so it takes the colour of text. */
        anchored: ink,

        // Semantic aliases used by the remaining shadcn primitives.
        background: paper,
        foreground: ink,
        border: hairline,
        input: hairline,
        ring: active,
        primary: { DEFAULT: active, foreground: ink },
        secondary: { DEFAULT: paper, foreground: ink },
        destructive: { DEFAULT: lapsed, foreground: sheet },
        muted: { DEFAULT: paper, foreground: inkWeak },
        accent: { DEFAULT: paper, foreground: ink },
        popover: { DEFAULT: sheet, foreground: ink },
        card: { DEFAULT: sheet, foreground: ink },
      },
      borderRadius: {
        // The entire shape vocabulary: 22 for surfaces, 12 for keys, pill for buttons, 4 for bars.
        card: "22px",
        key: "12px",
        bar: "4px",
        lg: "22px",
        md: "12px",
        sm: "4px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
