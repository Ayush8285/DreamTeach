/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'audi-black': '#000000',
        'audi-red': '#BB0A30',
        'audi-silver': '#C0C0C0',
        'audi-gray': '#4A4A4A',
      },
    },
  },
  plugins: [],
}
