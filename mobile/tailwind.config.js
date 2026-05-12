/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  presets: [require("nativewind/preset")],
  content: ["./App.{js,jsx,ts,tsx}", "./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-container': 'var(--color-primary-container)',
        'on-primary-container': 'var(--color-on-primary-container)',
        secondary: 'var(--color-secondary)',
        'secondary-container': 'var(--color-secondary-container)',
        error: 'var(--color-error)',
        'error-container': 'var(--color-error-container)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-container': 'var(--color-surface-container)',
        'surface-container-highest': 'var(--color-surface-container-highest)',
        'surface-container-lowest': 'var(--color-surface-container-lowest)',
        'on-surface': 'var(--color-on-surface)',
        'on-surface-variant': 'var(--color-on-surface-variant)',
        'outline-variant': 'var(--color-outline-variant)',
      },
    },
  },
  plugins: [],
}
