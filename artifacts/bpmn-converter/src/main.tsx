import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "./bpmn-theme.css";

createRoot(document.getElementById("root")!).render(<App />);
