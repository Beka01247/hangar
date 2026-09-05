import { BrowserWindow } from "electrobun/main";
import { installFileLogging, LOG_FILES } from "./log";
import { installApplicationMenu } from "./menu";
import { createAppRPC } from "./rpc";
import { startProxy } from "./services/proxy";
import { DATA_DIR } from "./store/json-store";

installFileLogging();
installApplicationMenu();
startProxy();

const rpc = createAppRPC();

new BrowserWindow({
	title: "Hangar",
	url: "views://mainview/index.html",
	rpc,
	frame: { width: 1100, height: 760 },
});

console.log(`hangar: started, data dir ${DATA_DIR}, logs: ${LOG_FILES.join(", ")}`);
