import express, { Express } from "express"
import { appendFile, existsSync, mkdirSync, writeFileSync } from "fs"
import { createServer, Server as HttpServer } from "http"
import { Server as SocketServer, Socket } from "socket.io"
import { v4 as uuidv4 } from "uuid"
import {
	BrokerConfig,
	BrokerLogEntry,
	MessagingLogEntry,
	SocketBook,
} from "./interfaces.js"
import { BrokerEvents, MessageProtocols } from "./enums.js"


export class Broker {
	/**
	 * A unique string that has to be provided in the header of a logs request to access the log files.
	 */
	accessLogsKey = ""
	/**
	 * The path to the folder where the log files will be stored.
	 */
	logFolderPath = ""
	/**
	 * Enable debug logging to the terminal.
	 */
	debug: boolean = false
	/**
	 * The address book for all the connected sockets.
	 */
	socketBook: SocketBook = {}
	/**
	 * The auth token that the machine and job agents need to provide to access the service.
	 */
	socketKey: string
	/**
	 * Creates a unique session id for each instance of the broker so we can track different sessions in the log.
	 */
	sessionUuid: string = uuidv4()
	/**
	 * The express server for log access
	 */
	app: Express = express()
	/**
	 * The http server
	 */
	httpServer: HttpServer = createServer(this.app)
	/**
	 * The socket server for brokering the connections between machines and jobs.
	 */
	io: SocketServer = new SocketServer(this.httpServer, {
		path: "/socket/",
		maxHttpBufferSize: 1e8, // 100MB
		cors: {
			origin: "*",
		},
	})

	/**
	 * Constructs an instance of the broker.
	 * @param config The parmeters required to configure the broker.
	 */
	constructor(config: BrokerConfig) {
		this.accessLogsKey = config.accessLogsKey
		this.logFolderPath = config.logFolderPath
		this.socketKey = config.socketKey

		if (config.debug) {
			this.debug = config.debug
		}

		this.configureExpress()
		this.configureIo()
	}

	/**
	 * Starts the server.
	 */
	start() {
		this.appendToBrokerLog(`broker-starting`)
		this.httpServer.listen(3000)
		console.log(`|- Serving on http://localhost:3000`)
	}

	/**
	 * Stops the server
	 */
	stop() {
		this.appendToBrokerLog(`broker-stopping`)
		this.io.close()
		this.httpServer.close()
	}

	/**
	 * Configures the logging functionality of the broker.
	 */
	configureExpress() {
		// check if the files exist
		const logFnames = ["broker.log", "messaging.log", "messaging-no-gcode.log"]
		for (const fname of logFnames) {
			const fullPath = `${this.logFolderPath}/${fname}`
			if (!existsSync(fullPath)) {
				if (!existsSync(this.logFolderPath)) {
					mkdirSync(this.logFolderPath)
				}
				writeFileSync(fullPath, "")
			}
		}

		if (this.accessLogsKey != "") {
			this.app.use("/logs/:fname", (req, res, next) => {
				if (!req.headers["logs_key"]) {
					return res.status(401).send()
				}

				if (Array.isArray(req.headers["logs_key"])) {
					return res.status(401).send()
				}

				if (req.headers["logs_key"] != this.accessLogsKey) {
					return res.status(401).send()
				}

				if (logFnames.includes(req.params.fname)) {
					const path = `${this.logFolderPath}/${req.params.fname}`
					return res.sendFile(path, (err) => {
						if (err) {
							next(err)
						}
					})
				}

				return res.status(404).send()
			})
		}
	}

	/**
	 * Configures socket.io for accepting connections.
	 */
	configureIo() {
		if (this.debug) console.log(`|- configuring-io`)

		this.io.on("connection", (socket) => {
			this.configureSocket(socket)
		})

		// Auth check
		this.io.use((socket, next) => {
			if (!socket.handshake.auth.token) {
				const err = new Error("No authorisation token provided")
				this.appendToBrokerLog(`no-authorisation-token-provided: ${socket.id}`)
				next(err)
			}

			if (!socket.handshake.headers["agent-type"]) {
				const err = new Error("No agent type provided")
				this.appendToBrokerLog(`no-agent-type-provided: ${socket.id}`)
				next(err)
			}

			if (!socket.handshake.headers["group-key"]) {
				const err = new Error("No group key provided")
				this.appendToBrokerLog(`no-group-key-provided: ${socket.id}`)
				next(err)
			}

			const token = socket.handshake.auth.token
			if (token != this.socketKey) {
				const err = new Error("Not authorised")
				this.appendToBrokerLog(`socket-not-authorised: ${socket.id}`)
				next(err)
			}

			if (
				typeof socket.handshake.headers["agent-type"] == "string" &&
				!["machine", "job"].includes(socket.handshake.headers["agent-type"])
			) {
				const err = new Error("Wrong agent type")
				this.appendToBrokerLog(`wrong-agent-type: ${socket.id}`)
				next(err)
			}

			next()
		})
	}

	/**
	 * Configures an incoming socket to broker connections to other sockets.
	 */
	configureSocket(socket: Socket) {
		if (this.debug) console.log(`new-connection: ${socket.id}`)
		this.appendToBrokerLog(`new-connection: ${socket.id}`)

		// Add socket to the address book
		if (
			typeof socket.handshake.headers["agent-type"] == "string" &&
			typeof socket.handshake.headers["group-key"] == "string"
		) {
			this.socketBook[socket.id] = {
				socket: socket,
				type: socket.handshake.headers["agent-type"],
				group: socket.handshake.headers["group-key"],
			}
		} else {
			// TODO error - We should not get here as it should be caught in the auth.
		}

		socket.on("disconnect", () => {
			if (this.debug) console.log(`disconnected: ${socket.id}`)
			this.appendToBrokerLog(`disconnected: ${socket.id}`)

			delete this.socketBook[socket.id]
		})

		// Protocols
		socket.on(BrokerEvents.DIRECT, (msg: any) =>
			this.handleDirectMsg(socket, msg)
		)

		socket.on(BrokerEvents.ALL_MACHINES, (msg: any) =>
			this.handleAllMessage(socket, msg, BrokerEvents.ALL_MACHINES)
		)

		socket.on(BrokerEvents.ALL_JOBS, (msg: any) =>
			this.handleAllMessage(socket, msg, BrokerEvents.ALL_JOBS)
		)

	}

	handleDirectMsg(originatingSocket: Socket, msg: any) {
		if (this.debug) {
			console.log(`${BrokerEvents.DIRECT}: ${JSON.stringify(msg)}`)
		}

		const errMsg = this.validateMsg(msg)
		if (errMsg) {
			originatingSocket.emit(MessageProtocols.MESSAGE_ERROR, errMsg)
			return
		}

		if (!(msg.toId in this.socketBook)) {
			if (this.debug)
				console.log(`${BrokerEvents.DIRECT}: no agent with this id`)
			originatingSocket.emit(
				MessageProtocols.MESSAGE_ERROR,
				"No agent with this id"
			)
			return
		}
		this.socketBook[msg.toId].socket.emit(BrokerEvents.DIRECT, msg)

		this.appendToMessagingLog(msg, originatingSocket)
		return
	}

	handleAllMessage(
		originatingSocket: Socket,
		msg: any,
		protocol: BrokerEvents.ALL_JOBS | BrokerEvents.ALL_MACHINES
	) {
		if (this.debug) console.log(`${protocol}: ${JSON.stringify(msg)}`)

		const errMsg = this.validateMsg(msg)
		if (errMsg) {
			originatingSocket.emit(MessageProtocols.MESSAGE_ERROR, errMsg)
			return
		}

		let type = ""
		if (protocol == BrokerEvents.ALL_JOBS) {
			type = "job"
		}
		if (protocol == BrokerEvents.ALL_MACHINES) {
			type = "machine"
		}
		const group = originatingSocket.handshake.headers["group-key"]

		for (const [_, value] of Object.entries(this.socketBook)) {
			// make sure it is the right type and not itself.
			if (
				value.type == type &&
				value.socket.id != originatingSocket.id &&
				value.group == group
			) {
				console.log("Sending on the message")
				value.socket.emit(protocol, msg)
			}
		}

		this.appendToMessagingLog(msg, originatingSocket)
	}

	validateMsg(msg: any): string {
		// 1. validate message form
		if (
			msg["fromId"] == undefined ||
			msg["toId"] == undefined ||
			msg["subject"] == undefined ||
			msg["body"] == undefined
		) {
			if (this.debug) console.log(`validateMsg: malformed message`)
			return "Malformed message"
		}
		return ""
	}

	/**
	 * Append to the broker log.
	 * @param msg
	 */
	appendToBrokerLog(msg: string) {
		const path = `${this.logFolderPath}/broker.log`
		const entry: BrokerLogEntry = {
			sessionUuid: this.sessionUuid,
			date: new Date(),
			entry: msg,
		}
		appendFile(path, JSON.stringify(entry) + "\n", (err) => {
			if (err) console.log(err)
		})
	}

	/**
	 * Append to the messaging log both with and without gcode.
	 * @param msg
	 */
	appendToMessagingLog(msg: any, socket: Socket) {
		const messagingFilePath = `${this.logFolderPath}/messaging.log`

		let groupKey = ""
		if (typeof socket.handshake.headers["group-key"] == "string") {
			groupKey = socket.handshake.headers["group-key"]
		}

		let agentType = ""
		if (typeof socket.handshake.headers["agent-type"] == "string") {
			agentType = socket.handshake.headers["agent-type"]
		}

		let entry: MessagingLogEntry = {
			sessionUuid: this.sessionUuid,
			groupKey: groupKey,
			fromAgentType: agentType,
			msg: msg,
			date: new Date(),
		}
		appendFile(messagingFilePath, JSON.stringify(entry) + "\n", (err) => {
			if (err) console.log(err)
		})

		const messagingNoGcodeFilePath = `${this.logFolderPath}/messaging-no-gcode.log`
		if (msg.body && msg.body.gcode) {
			entry.msg.body.gcode = ""
		}
		appendFile(
			messagingNoGcodeFilePath,
			JSON.stringify(entry) + "\n",
			(err) => {
				if (err) console.log(err)
			}
		)
	}
}

const broker = new Broker({
	logFolderPath: "/app/logs",
	accessLogsKey: "VirtualBAM",
	socketKey: "VirtualBAM",
	debug: true,
})
broker.start()
