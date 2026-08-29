/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ---- Design tokens for Smart Land Analysis Platform ----
        // "Night map" ink for headings & primary text
        ink: '#0B1B2B',
        // Water / sky / trust
        blue: {
          DEFAULT: '#2563EB',
          deep: '#12306B',
          light: '#DBEAFE',
          mist: '#EFF5FF',
        },
        // Land / growth / positive suitability
        green: {
          DEFAULT: '#16A34A',
          deep: '#0B6B33',
          light: '#DCFCE7',
        },
        // Warm risk / amber
        amber: {
          DEFAULT: '#D97706',
          light: '#FEF3C7',
        },
        // Danger
        danger: {
          DEFAULT: '#DC2626',
          light: '#FEE2E2',
        },
        mist: '#F5F8FC',
        line: '#E2E8F0',
        slate: {
          DEFAULT: '#64748B',
          dim: '#94A3B8',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(115deg, #2563EB 0%, #16A34A 100%)',
        'ink-gradient': 'linear-gradient(180deg, #0B1B2B 0%, #12306B 100%)',
      },
      boxShadow: {
        soft: '0 4px 24px rgba(11, 27, 43, 0.06)',
        card: '0 2px 12px rgba(11, 27, 43, 0.05)',
        lift: '0 12px 32px rgba(11, 27, 43, 0.12)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(16px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        floatSlow: 'floatSlow 5s ease-in-out infinite',
        fadeUp: 'fadeUp 0.6s ease-out both',
      },
    },
  },
  plugins: [],
}
