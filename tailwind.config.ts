import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    screens: {
      xs: '360px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-surface': 'var(--bg-surface)',
        'bg-card': 'var(--bg-card)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-overlay': 'var(--bg-overlay)',

        accent: 'var(--accent-primary)',
        'accent-hover': 'var(--accent-primary-hover)',
        'accent-muted': 'var(--accent-primary-muted)',
        'accent-secondary': 'var(--accent-secondary)',
        'accent-secondary-hover': 'var(--accent-secondary-hover)',
        'accent-gold': 'var(--accent-gold)',
        'accent-gold-hover': 'var(--accent-gold-hover)',
        'accent-gold-muted': 'var(--accent-gold-muted)',

        success: 'var(--color-success)',
        'success-muted': 'var(--color-success-muted)',
        error: 'var(--color-error)',
        'error-muted': 'var(--color-error-muted)',
        warning: 'var(--color-warning)',
        'warning-muted': 'var(--color-warning-muted)',
        info: 'var(--color-info)',
        'info-muted': 'var(--color-info-muted)',

        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'text-disabled': 'var(--text-disabled)',
        'text-inverse': 'var(--text-inverse)',

        'border-default': 'var(--border-default)',
        'border-muted': 'var(--border-muted)',
        'border-focus': 'var(--border-focus)',
        'border-error': 'var(--border-error)',

        'session-pre-abertura': 'var(--session-pre-abertura)',
        'session-negociacao': 'var(--session-negociacao)',
        'session-call': 'var(--session-call)',
        'session-after-market': 'var(--session-after-market)',
        'session-fechado': 'var(--session-fechado)',

        'plan-jogador': 'var(--plan-jogador)',
        'plan-craque': 'var(--plan-craque)',
        'plan-lenda': 'var(--plan-lenda)',

        'price-up': 'var(--price-up)',
        'price-down': 'var(--price-down)',
        'price-neutral': 'var(--price-neutral)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },
      zIndex: {
        dropdown: 'var(--z-dropdown)',
        sticky: 'var(--z-sticky)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
        tooltip: 'var(--z-tooltip)',
      },
    },
  },
  plugins: [],
}

export default config
