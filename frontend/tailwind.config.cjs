const { heroui } = require("@heroui/react");

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {}
  },
  darkMode: "class",
  plugins: [heroui()]
};
