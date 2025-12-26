import React from "react";
import ReactDOM from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "./index.css";
import App from "./App.jsx";
import { Theme } from "@radix-ui/themes";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Theme appearance="light" accentColor="indigo" radius="large">
      <App />
    </Theme>
  </React.StrictMode>
);
