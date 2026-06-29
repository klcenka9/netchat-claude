/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mapped to CSS variables for light/dark theming (spec §11).
        bg: 'var(--bg)',
        'bg-alt': 'var(--bg-alt)',
        'bg-soft': 'var(--bg-soft)',
        panel: 'var(--panel)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        border: 'var(--border)',
      },
    },
  },
  plugins: [],
};
