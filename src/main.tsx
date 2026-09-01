import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Results from "./Results";
import "./styles.css";

const normalizedPath = window.location.pathname.replace(/\/$/, "") || "/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{normalizedPath === "/resultados" ? <Results /> : <App />}</StrictMode>,
);
