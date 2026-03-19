import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ZNIT Brand Palette (Manual da Marca p.13)
        brand: {
          DEFAULT: "#56B7A5",
          50: "#E6F3EE",
          100: "#C8E6DE",
          200: "#A9D7CD",
          300: "#81C8B9",
          400: "#56B7A5",
          500: "#3EA08E",
          600: "#2E8577",
          700: "#1F6B5E",
          800: "#125045",
          900: "#08332C",
        },
        // ZNIT Neutrals
        znit: {
          black: "#030304",
          gray900: "#404040",
          gray600: "#808181",
          gray300: "#BDBDBC",
          white: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: ["Nunito Sans", "system-ui", "sans-serif"],
        display: ["Gotham", "Nunito Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(3,3,4,0.08), 0 1px 2px rgba(3,3,4,0.04)",
        "card-hover": "0 4px 12px rgba(3,3,4,0.12), 0 2px 4px rgba(3,3,4,0.06)",
        dropdown: "0 8px 24px rgba(3,3,4,0.12), 0 2px 8px rgba(3,3,4,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
