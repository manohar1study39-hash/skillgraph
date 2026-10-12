/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Sora', 'Plus Jakarta Sans', 'sans-serif'],
      },
      fontSize: {
        'hero': ['clamp(2.25rem, 4vw, 3.5rem)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        'page-title': ['1.75rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '600' }], // 28/36
        'section-title': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '600' }], // 20/28
        'card-title': ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }], // 16/24
        'body': ['0.9375rem', { lineHeight: '1.5rem', letterSpacing: '0' }], // 15/24
        'small': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0' }], // 14/20
        'label': ['0.8125rem', { lineHeight: '1rem', letterSpacing: '0.04em', fontWeight: '500' }], // 13/16
        'label-sm': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.04em', fontWeight: '500' }], // 12/16
        '2xs': ['0.75rem', { lineHeight: '1rem' }],
        'xs': ['0.8125rem', { lineHeight: '1.25rem' }],
        'sm': ['0.875rem', { lineHeight: '1.375rem' }],
        'base': ['0.9375rem', { lineHeight: '1.5rem' }],
        'lg': ['1.0625rem', { lineHeight: '1.65rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.625rem' }],
      },
      borderRadius: {
        'card': '16px',
        'button': '10px',
        'input': '10px',
        'chip': '9999px',
        'DEFAULT': '10px',
      },
      boxShadow: {
        'xs': 'var(--shadow-xs)',
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
        'glow': 'var(--shadow-glow)',
        'glow-cyan': 'var(--shadow-glow-cyan)',
        'card': 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        'modal': 'var(--shadow-modal)',
        'popover': 'var(--shadow-popover)',
      },
      backgroundImage: {
        'aurora': 'linear-gradient(135deg, #6D4AFF 0%, #19C3E6 100%)',
        'aurora-hover': 'linear-gradient(135deg, #5B3AF0 0%, #15B0D0 100%)',
        'aurora-subtle': 'linear-gradient(135deg, rgba(109,74,255,0.08) 0%, rgba(25,195,230,0.08) 100%)',
        'brand-panel': 'linear-gradient(145deg, #0B1020 0%, #161233 45%, #241442 100%)',
      },
      transitionDuration: {
        'fast': '120ms',
        'base': '200ms',
        'slow': '320ms',
      },
      transitionTimingFunction: {
        'aurora': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      colors: {
        background: 'var(--bg-background)',
        sidebar: 'var(--bg-sidebar)',
        'nav-active': 'var(--bg-nav-active)',
        ink: {
          DEFAULT: 'var(--text-ink)',
          light: '#0B1020',
          dark: '#F3F5FB',
        },
        body: {
          DEFAULT: 'var(--text-body)',
        },
        muted: {
          DEFAULT: 'var(--text-muted)',
        },
        disabled: {
          DEFAULT: 'var(--text-disabled)',
        },
        highlight: {
          DEFAULT: 'var(--color-highlight)',
          tint: 'var(--color-highlight-tint)',
          strong: 'var(--color-highlight)',
        },
        surface: {
          DEFAULT: 'var(--bg-surface)',
          alt: 'var(--bg-surface-alt)',
          hover: 'var(--bg-surface-hover)',
          raised: 'var(--bg-surface-raised)',
        },
        border: {
          DEFAULT: 'var(--border-color)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          active: 'var(--color-primary-active)',
          tint: 'var(--color-primary-tint)',
        },
        cyan: {
          DEFAULT: 'var(--color-cyan)',
          tint: 'var(--color-cyan-tint)',
        },
        secondary: {
          DEFAULT: 'var(--color-cyan)',
          tint: 'var(--color-cyan-tint)',
        },
        accent: {
          DEFAULT: 'var(--color-cyan)',
          hover: 'var(--color-cyan-hover)',
          tint: 'var(--color-cyan-tint)',
        },
        brand: {
          deep: 'var(--brand-deep)',
          navy: 'var(--brand-navy)',
          indigo: 'var(--color-primary)',
        },
        role: {
          employee: 'var(--role-employee)',
          'employee-tint': 'var(--role-employee-tint)',
          manager: 'var(--role-manager)',
          'manager-tint': 'var(--role-manager-tint)',
          hr: 'var(--role-hr)',
          'hr-tint': 'var(--role-hr-tint)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          text: 'var(--color-success-text)',
          strong: 'var(--color-success-text)',
          tint: 'var(--color-success-tint)',
          border: 'var(--color-success-border)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          text: 'var(--color-warning-text)',
          strong: 'var(--color-warning-text)',
          tint: 'var(--color-warning-tint)',
          border: 'var(--color-warning-border)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          hover: 'var(--color-danger-hover)',
          text: 'var(--color-danger-text)',
          tint: 'var(--color-danger-tint)',
          border: 'var(--color-danger-border)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          text: 'var(--color-info-text)',
          tint: 'var(--color-info-tint)',
          border: 'var(--color-info-border)',
        },
      }
    },
  },
  plugins: [],
}
