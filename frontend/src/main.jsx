import React from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
import "@heroui/react/styles.css";
import { ThemeProvider } from "next-themes";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HeroUIProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
        <App />
      </ThemeProvider>
    </HeroUIProvider>
  </React.StrictMode>
);
