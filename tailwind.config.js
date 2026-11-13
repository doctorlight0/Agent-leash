/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        line: 'var(--line)',
        lineStrong: 'var(--line-strong)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        accentInk: 'var(--accent-ink)',
        danger: 'var(--danger)',
        ok: 'var(--ok)',
      },
    },
  },
  plugins: [],
}
