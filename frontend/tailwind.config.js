export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#ea2804",
        "primary-deep": "#c01f00",
        ink: "#202020",
        body: "#3a3a3a",
        charcoal: "#575757",
        mute: "#646464",
        ash: "#8d8d8d",
        canvas: "#f9f7f3",
        bone: "#f3f0e8",
        card: "#ffffff",
        dark: "#202020",
        deep: "#000000",
        hairline: "rgba(32,32,32,0.12)",
        success: "#2b9a66",
      },
      fontFamily: {
        display: ["Bricolage Grotesque", "Arial", "sans-serif"],
        sans: ["Inter", "Geist", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
      borderRadius: {
        card: "10px",
        panel: "16px",
      },
    },
  },
  plugins: [],
};
