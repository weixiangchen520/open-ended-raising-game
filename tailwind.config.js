/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        star: {
          bg: "#07071a",
          panel: "rgb(28 22 62 / 0.74)",
          line: "rgb(184 164 255 / 0.18)",
          muted: "#a9a0c6",
          purple: "#8f63ff",
          cyan: "#69e4dd",
          gold: "#f0b15a"
        }
      },
      boxShadow: {
        glow: "0 0 36px rgb(143 99 255 / 0.22)",
        card: "0 22px 55px rgb(0 0 0 / 0.34)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};
