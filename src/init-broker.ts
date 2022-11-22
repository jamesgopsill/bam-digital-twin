import { Broker } from "./agents/broker.js"

const broker = new Broker({
	logFolderPath: "/app/logs",
	accessLogsKey: "VirtualBAM",
	socketKey: "VirtualBAM",
	debug: true,
})
broker.start()