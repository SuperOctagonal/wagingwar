/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#00471b',
        'brand-dark': '#005c23',
        rail: '#1a2634',
        'rail-border': '#2d3a47',
      },
      fontFamily: {
        space: ['var(--font-space-grotesk)', 'sans-serif'],
        bebas: ['var(--font-bebas-neue)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
