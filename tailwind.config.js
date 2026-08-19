/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // lib/ holds the Career Pathway colour constants (phase styles, tag
    // palette), so Tailwind has to scan it too. Without this, any class that
    // appears ONLY there is never generated and silently renders as nothing —
    // which is what made the Fellowship legend dot invisible.
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
}
