/** @type {import('tailwindcss').Config} */
module.exports = {
  // Files Tailwind scans for used class names (anything not found here gets purged)
  content: ['./index.html', './src/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          900: '#312E81',
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
