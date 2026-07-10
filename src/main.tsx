import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/shippori-mincho/400.css";
import "@fontsource/shippori-mincho/500.css";
import "@fontsource/shippori-mincho/600.css";
import "@fontsource/shippori-mincho/700.css";
import "@fontsource/zen-kaku-gothic-new/400.css";
import "@fontsource/zen-kaku-gothic-new/500.css";
import "@fontsource/zen-kaku-gothic-new/700.css";
import { injectThemeVars } from "./theme";
import "./global.css";
import App from "./App";

injectThemeVars();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
