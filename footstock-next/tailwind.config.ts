import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        "bg-primary": "var(--bg-primary)",
        "bg-surface": "var(--bg-surface)",
        "bg-card": "var(--bg-card)",
        "bg-elevated": "var(--bg-elevated)",
        "bg-overlay": "var(--bg-overlay)",
        // Text
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        // Accent / Gold
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-gold": "var(--accent-gold)",
        "accent-secondary": "var(--accent-secondary)",
        // Semantic
        success: "var(--color-success)",
        error: "var(--color-error)",
        warning: "var(--color-warning)",
        info: "var(--color-info)",
        // Price
        "price-up": "var(--price-up)",
        "price-down": "var(--price-down)",
        "price-neutral": "var(--price-neutral)",
        // Border
        border: "var(--border-default)",
        "border-focus": "var(--border-focus)",
        "border-error": "var(--border-error)",
        // Plans
        "plan-jogador": "var(--plan-jogador)",
        "plan-craque": "var(--plan-craque)",
        "plan-lenda": "var(--plan-lenda)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Helvetica Neue", "sans-serif"],
        display: ["var(--font-playfair)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains)", "Fira Mono", "monospace"],
      },
      fontSize: {
        micro: ["8px", { lineHeight: "1.2" }],
        xs: ["10px", { lineHeight: "1.3" }],
        sm: ["12px", { lineHeight: "1.4" }],
        base: ["14px", { lineHeight: "1.5" }],
        md: ["16px", { lineHeight: "1.5" }],
        lg: ["18px", { lineHeight: "1.4" }],
        xl: ["22px", { lineHeight: "1.3" }],
        "2xl": ["28px", { lineHeight: "1.1" }],
      },
      borderRadius: {
        none: "0",
        xs: "3px",
        sm: "6px",
        md: "9px",
        lg: "12px",
        xl: "18px",
        "2xl": "24px",
        full: "9999px",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(0,0,0,0.4)",
        md: "0 4px 8px rgba(0,0,0,0.5)",
        lg: "0 10px 20px rgba(0,0,0,0.6)",
        "glow-gold": "0 8px 32px rgba(201,168,76,.3)",
        "glow-gold-sm": "0 6px 24px rgba(201,168,76,.3)",
        "glow-success": "0 0 7px var(--color-success)",
        "glow-error": "0 0 7px var(--color-error)",
        "overlay-border": "0 0 0 1px rgba(201,168,76,.18)",
      },
      zIndex: {
        dropdown: "100",
        sticky: "200",
        modal: "300",
        toast: "400",
        tooltip: "500",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "tick-up": {
          "0%, 100%": { color: "var(--price-up)", backgroundColor: "transparent" },
          "20%": { backgroundColor: "rgba(34,197,94,0.15)" },
        },
        "tick-down": {
          "0%, 100%": { color: "var(--price-down)", backgroundColor: "transparent" },
          "20%": { backgroundColor: "rgba(239,68,68,0.15)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "splash-in": {
          "0%": { opacity: "0", transform: "scale(0.8)" },
          "30%": { opacity: "1", transform: "scale(1.05)" },
          "50%": { opacity: "1", transform: "scale(1)" },
          "80%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.95)" },
        },
        "splash-bg-fade": {
          "0%, 80%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        "tick-up": "tick-up 0.8s ease-out",
        "tick-down": "tick-down 0.8s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "splash-in": "splash-in 2.8s ease-in-out forwards",
        "splash-bg-fade": "splash-bg-fade 2.8s ease-in-out forwards",
        "pulse-dot": "pulse-dot 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
