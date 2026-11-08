import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/archivo/latin-700.css";
import "@fontsource/archivo/latin-800.css";
import "@fontsource/instrument-sans/latin-400.css";
import "@fontsource/instrument-sans/latin-600.css";
import "@fontsource/chivo-mono/latin-400.css";
import "@fontsource/chivo-mono/latin-600.css";
import "@fontsource/stix-two-text/latin-700.css";
import "@fontsource/stix-two-text/latin-700-italic.css";
import "./stile.css";
import { Animazioni } from "./Animazioni";
import { Mappa } from "./Mappa";

const mappa = new URLSearchParams(window.location.search).get("mappa");
const radice = document.getElementById("radice");
if (!radice) throw new Error("manca #radice in index.html");
createRoot(radice).render(<StrictMode>{mappa ? <Mappa slug={mappa} /> : <Animazioni />}</StrictMode>);
