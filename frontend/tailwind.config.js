/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fichaspot: {
          dark: '#0B0F19',
          card: '#111827',
          cardLighter: '#1A2234',
          border: '#1F293D',
          borderLight: '#2D3A54',
          blue: '#2563EB',
          blueHover: '#1D4ED8',
          blueLight: '#3B82F6',
          textMuted: '#94A3B8',
          textMain: '#F8FAFC',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
