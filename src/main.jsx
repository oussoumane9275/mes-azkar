import "./storage-shim.js";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/700.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/500.css";
import "@fontsource/lora/600.css";
import "@fontsource/lora/400-italic.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import AzkarApp from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(<AzkarApp />);
