import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root")!;
if (!root.hasChildNodes()) {
	createRoot(root).render(<App />);
}
