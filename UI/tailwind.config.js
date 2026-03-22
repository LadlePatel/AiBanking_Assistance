/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          bg: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          chat: 'var(--bg-chat)',
          input: 'var(--bg-input)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          hover: 'var(--accent-hover)',
          glow: 'var(--accent-glow)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          user: 'var(--text-user)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          medium: 'var(--border-medium)',
          accent: 'var(--border-accent)',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      borderRadius: {
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      animation: {
        'reveal': 'slideReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
