import type { Config } from "tailwindcss";

/** Colour token backed by an RGB channel triplet CSS variable so `/<alpha>` modifiers work. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    // Type scale (BUILD_CONTRACTS 8.3). Replaces Tailwind's defaults on purpose.
    fontSize: {
      xs: ["12px", { lineHeight: "16px", letterSpacing: "0" }],
      sm: ["13px", { lineHeight: "20px", letterSpacing: "0" }],
      base: ["15px", { lineHeight: "24px", letterSpacing: "0" }],
      lg: ["17px", { lineHeight: "28px", letterSpacing: "-0.005em" }],
      xl: ["20px", { lineHeight: "28px", letterSpacing: "-0.01em" }],
      "2xl": ["24px", { lineHeight: "30px", letterSpacing: "-0.015em" }],
      "3xl": ["32px", { lineHeight: "38px", letterSpacing: "-0.02em" }],
      "4xl": ["44px", { lineHeight: "48px", letterSpacing: "-0.025em" }],
      "5xl": ["60px", { lineHeight: "62px", letterSpacing: "-0.03em" }],
    },
    // Radius scale (8.4).
    borderRadius: {
      none: "0",
      sm: "4px",
      DEFAULT: "8px",
      md: "8px",
      lg: "12px",
      xl: "16px",
      full: "9999px",
    },
    // Shadows (8.4). Colour comes from --shadow-color so dark mode can deepen them.
    boxShadow: {
      none: "none",
      xs: "0 1px 2px rgb(var(--shadow-color) / 0.06)",
      sm: "0 1px 3px rgb(var(--shadow-color) / 0.08), 0 1px 2px rgb(var(--shadow-color) / 0.04)",
      DEFAULT: "0 1px 3px rgb(var(--shadow-color) / 0.08), 0 1px 2px rgb(var(--shadow-color) / 0.04)",
      md: "0 8px 24px -6px rgb(var(--shadow-color) / 0.14), 0 2px 6px rgb(var(--shadow-color) / 0.06)",
      lg: "0 24px 56px -12px rgb(var(--shadow-color) / 0.24)",
    },
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        sunken: token("sunken"),
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        ink: {
          DEFAULT: token("ink"),
          secondary: token("ink-secondary"),
          muted: token("ink-muted"),
          faint: token("ink-faint"),
        },
        brand: {
          DEFAULT: token("brand"),
          hover: token("brand-hover"),
          soft: token("brand-soft"),
          ink: token("brand-ink"),
        },
        "on-brand": token("on-brand"),
        danger: {
          DEFAULT: token("danger"),
          soft: token("danger-soft"),
          ink: token("danger-ink"),
        },
        warning: {
          DEFAULT: token("warning"),
          soft: token("warning-soft"),
          ink: token("warning-ink"),
        },
        success: {
          DEFAULT: token("success"),
          soft: token("success-soft"),
          ink: token("success-ink"),
        },
        // Data colours only: source dots, mix bars, charts.
        source: {
          appstore: token("source-appstore"),
          playstore: token("source-playstore"),
          reddit: token("source-reddit"),
          hn: token("source-hn"),
          hackernews: token("source-hn"),
          trustpilot: token("source-trustpilot"),
          widget: token("source-widget"),
          extension: token("source-extension"),
          manual: token("source-manual"),
          import: token("source-manual"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      maxWidth: {
        prose: "68ch",
        app: "1200px",
        form: "720px",
        marketing: "1160px",
      },
      zIndex: {
        topbar: "30",
        drawer: "40",
        popover: "50",
        dialog: "60",
        toast: "70",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        entrance: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        120: "120ms",
        180: "180ms",
        240: "240ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-up-sm": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "sheet-in": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "drawer-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms cubic-bezier(0.2, 0, 0, 1)",
        "fade-out": "fade-out 120ms cubic-bezier(0.2, 0, 0, 1)",
        "slide-up-sm": "slide-up-sm 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        "sheet-in": "sheet-in 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        "drawer-in": "drawer-in 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
