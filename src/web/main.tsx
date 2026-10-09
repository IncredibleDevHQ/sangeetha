import { restoreAuthDestination } from "./routes";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./design-system.css";
import "./workspaces.css";
import "./tulsi.css";
restoreAuthDestination();
// The entrance animation belongs to the first view only; later navigation stays still.
window.setTimeout(
  () => document.documentElement.setAttribute("data-settled", ""),
  2500,
);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
