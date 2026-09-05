import { ApplicationMenu } from "electrobun/main";

export function installApplicationMenu(): void {
	ApplicationMenu.setApplicationMenu([
		{
			label: "Hangar",
			submenu: [{ role: "about" }, { type: "divider" }, { role: "hide" }, { role: "hideOthers" }, { type: "divider" }, { role: "quit" }],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "divider" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "Window",
			submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "divider" }, { role: "close" }],
		},
	]);
}
