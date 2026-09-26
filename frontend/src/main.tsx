import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { preloadModels } from "./three/MissionTable";
import "./styles/app.css";

// Fetch every local GLB up front so nothing loads mid-demo.
preloadModels();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
