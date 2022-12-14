import cluster from "cluster"
import http from "http"
import os from "os"
import { Server, Socket } from "socket.io"
import { setupMaster, setupWorker } from "@socket.io/sticky"
import { createAdapter, setupPrimary } from "@socket.io/cluster-adapter"
import { appendFile, existsSync, mkdirSync, writeFileSync } from "fs"

import { AgentTypes, BrokerEvents, MessageProtocols } from "./utils/enums.js"
import {
	Message,
	BrokerLogEntry,
	MessagingLogEntry,
} from "./utils/interfaces.js"

const nProcesses = parseInt(process.env.N_PROCESSES) || 2
const debug = process.env.DEBUG === "true" || false
console.log(`DEBUG: ${debug}`)

const numCPUs = os.cpus.length

// TODO: handle message checks to somewhere.

if (cluster.isPrimary) {
	console.log(`Master ${process.pid} is running.`)

	const httpServer = http.createServer()

	// setup sticky sessions
	setupMaster(httpServer, {
		loadBalancingMethod: "least-connection",
	})

	setupPrimary()

	cluster.setupPrimary()

	httpServer.listen(3000)

	for (let i = 0; i < nProcesses; i++) {
		cluster.fork()
	}

	cluster.on("exit", (worker) => {
		console.log(`Worker ${worker.process.pid} died`)
		cluster.fork()
	})
} else {
	console.log(`Worker ${process.pid} started`)

	// Create log file
	if (!existsSync(`/app/logs`)) {
		mkdirSync(`/app/logs`)
	}

	const httpServer = http.createServer()
	const io = new Server(httpServer, {
		path: "/socket/",
		maxHttpBufferSize: 1e8, // 100MB
		cors: {
			origin: "*",
		},
	})

	const validateMsg = (msg: any) => {
		// 1. validate message form
		if (
			msg["fromId"] == undefined ||
			msg["toId"] == undefined ||
			msg["subject"] == undefined ||
			msg["body"] == undefined
		) {
			if (debug) console.log(`validateMsg: malformed message`)
			return "Malformed message"
		}
		return ""
	}

	const handleDirectMsg = (socket: Socket, msg: Message) => {
		if (debug) {
			console.log(`${BrokerEvents.DIRECT}: ${msg.subject}`)
		}

		const errMsg = validateMsg(msg)
		if (errMsg) {
			socket.emit(MessageProtocols.MESSAGE_ERROR, errMsg)
			return
		}

		try {
			io.to(msg.toId).emit(BrokerEvents.DIRECT, msg)
		} catch (err) {
			console.log("Error emitting message")
			socket.emit(MessageProtocols.MESSAGE_ERROR, errMsg)
		}

		appendToMessagingLog(msg, socket)
		return
	}

	const handleAllMachinesMsg = (socket: Socket, msg: Message) => {
		if (debug) {
			console.log(`${BrokerEvents.ALL_MACHINES}: ${msg.subject}`)
		}

		const errMsg = validateMsg(msg)
		if (errMsg) {
			socket.emit(MessageProtocols.MESSAGE_ERROR, errMsg)
			return
		}

		io.to(AgentTypes.MACHINE).emit(BrokerEvents.ALL_MACHINES, msg)
		appendToMessagingLog(msg, socket)
	}

	const handleAllJobsMsg = (socket: Socket, msg: Message) => {
		if (debug) {
			console.log(`${BrokerEvents.ALL_JOBS}: ${msg.subject}`)
		}

		const errMsg = validateMsg(msg)
		if (errMsg) {
			socket.emit(MessageProtocols.MESSAGE_ERROR, errMsg)
			return
		}

		io.to(AgentTypes.JOB).emit(BrokerEvents.ALL_JOBS, msg)
		appendToMessagingLog(msg, socket)
	}

	const handleConnect = (socket: Socket) => {
		if (debug) console.log(`${socket.id} connected to worker ${process.pid}`)
		// Put the jobs and machines into separate rooms.
		const agentType = socket.handshake.headers["agent-type"]
		if (typeof agentType == "string") {
			socket.join(agentType)
		} else {
			console.log("Should not get here!")
		}

		socket.on("disconnect", () => {
			if (debug) console.log(`Disconnected: ${socket.id}`)
			appendToBrokerLog(`disconnected: ${socket.id}`)
		})

		socket.on(BrokerEvents.DIRECT, (msg: any) => handleDirectMsg(socket, msg))

		socket.on(BrokerEvents.ALL_MACHINES, (msg: any) =>
			handleAllMachinesMsg(socket, msg)
		)

		socket.on(BrokerEvents.ALL_JOBS, (msg: any) =>
			handleAllJobsMsg(socket, msg)
		)

		appendToBrokerLog(`new-connection: ${socket.id}`)
	}

	const handleAuth = (socket: Socket, next: Function) => {
		if (!socket.handshake.auth.token) {
			const err = new Error("No authorisation token provided")
			next(err)
		}

		if (!socket.handshake.headers["agent-type"]) {
			const err = new Error("No agent type provided")
			next(err)
		}

		if (!socket.handshake.headers["group-key"]) {
			const err = new Error("No group key provided")
			next(err)
		}

		const token = socket.handshake.auth.token
		if (token != "VirtualBAM") {
			const err = new Error("Not authorised")
			next(err)
		}

		if (
			typeof socket.handshake.headers["agent-type"] == "string" &&
			!["machine", "job"].includes(socket.handshake.headers["agent-type"])
		) {
			const err = new Error("Wrong agent type")
			next(err)
		}
		next()
	}

	const appendToMessagingLog = (msg: any, socket: Socket) => {
		const messagingFilePath = `/app/logs/${process.pid}_messaging.log`

		let groupKey = ""
		if (typeof socket.handshake.headers["group-key"] == "string") {
			groupKey = socket.handshake.headers["group-key"]
		}

		let agentType = ""
		if (typeof socket.handshake.headers["agent-type"] == "string") {
			agentType = socket.handshake.headers["agent-type"]
		}

		let entry: MessagingLogEntry = {
			sessionUuid: process.pid.toString(),
			groupKey: groupKey,
			fromAgentType: agentType,
			msg: msg,
			date: new Date(),
		}
		appendFile(messagingFilePath, JSON.stringify(entry) + "\n", (err) => {
			if (err) console.log(err)
		})

		const messagingNoGcodeFilePath = `/app/logs/${process.pid}_messaging-no-gcode.log`
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

	const appendToBrokerLog = (msg: string) => {
		const path = `/app/logs/${process.pid}_broker.log`
		const entry: BrokerLogEntry = {
			sessionUuid: process.pid.toString(),
			date: new Date(),
			entry: msg,
		}
		appendFile(path, JSON.stringify(entry) + "\n", (err) => {
			if (err) console.log(err)
		})
	}

	// use the cluster adapter
	io.adapter(createAdapter())

	// setup connection with the primary process
	setupWorker(io)

	io.use(handleAuth)
	io.on("connection", handleConnect)
	appendToBrokerLog("broker-starting")
}
