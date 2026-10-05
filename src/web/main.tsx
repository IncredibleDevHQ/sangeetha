import { restoreAuthDestination } from "./routes";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./design-system.css";
import "./workspaces.css";
restoreAuthDestination();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
