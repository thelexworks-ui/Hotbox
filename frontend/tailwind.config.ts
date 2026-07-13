import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "hb-bg":       "var(--hotbox-bg)",
        "hb-surface":  "var(--hotbox-surface)",
        "hb-surface2": "var(--hotbox-surface-2)",
        "hb-border":   "var(--hotbox-border)",
        "hb-accent":   "var(--hotbox-accent)",
        "hb-text":     "var(--hotbox-text)",
        "hb-muted":    "var(--hotbox-text-muted)",
        "hb-dim":      "var(--hotbox-text-dim)",
        "hb-online":   "var(--hotbox-online)",
        "hb-offline":  "var(--hotbox-offline)",
        "hb-crashed":  "var(--hotbox-crashed)",
      },
    },
  },
  plugins: [],
};
export default config;
