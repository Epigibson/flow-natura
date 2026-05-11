/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: '#476810',
        'primary-container': '#c7f089',
        secondary: '#55624c',
        'secondary-container': '#d9e7cb',
        tertiary: '#386666',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        background: '#fdfdf5',
        surface: '#fdfdf5',
        'surface-container': '#f1f1e9',
      },
    },
  },
  plugins: [],
}
