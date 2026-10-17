import React from "react";
import { IconContext } from "@phosphor-icons/react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./styles/global.css";
import "./styles/site.css";
import "./styles/fieldwork.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <IconContext.Provider value={{ weight: "light" }}><App /></IconContext.Provider>
  </React.StrictMode>,
);
