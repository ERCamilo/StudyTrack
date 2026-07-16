/** @type {import('tailwindcss').Config} */
module.exports = {
  // Files Tailwind scans for used class names (anything not found here gets purged)
  content: ['./index.html', './src/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Outfit', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#1D4ED8',
          700: '#1E40AF',
          900: '#1E3A8A',
        },
      },
    },
  },
  // Grade-letter colors can be loaded from saved config/localStorage (not always present
  // as literals in source), so keep them regardless of purge.
  safelist: [
    'text-emerald-500',
    'text-blue-500',
    'text-yellow-500',
    'text-orange-500',
    'text-red-500',
    'text-slate-500',
  ],
}
