import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f5eb",
          100: "#eaf0e6",
          200: "#dfe4da",
          300: "#becabb",
          400: "#6f7a6d",
          500: "#1a7f37",
          600: "#006e2a",
          700: "#006426",
          800: "#00531e",
          900: "#002108",
        },
        surface: {
          background: "#f6f8fa",
          border: "#d0d7de",
          muted: "#636c76",
          text: "#1f2328",
          panel: "#ffffff",
          soft: "#f0f5eb",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
