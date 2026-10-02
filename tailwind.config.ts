import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5",
        primarySoft: "#EEF2FF",
        ink: "#12141A",
        muted: "#667085",
        line: "#E6E8F0",
        canvas: "#F5F6FB",
        collab: "#8B5CF6",
      },
      fontFamily: {
        sans: [
          "var(--font-noto)",
          "Noto Sans SC",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 10px 30px rgba(16,24,40,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
