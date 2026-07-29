import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Placeholder accent until BAB confirms the brand hex (Phase 0 item f).
        accent: "#C8102E",
      },
    },
  },
  plugins: [],
};

export default config;
