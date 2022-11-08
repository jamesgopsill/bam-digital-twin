import path from "path"
import { fileURLToPath } from "url"
import { readFileSync } from "fs"
import io from "socket.io-client"
import { AgentTypes, BrokerEvents, JobStates, MessageProtocols } from "./enums.js"
import { Message } from "./interfaces.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const wait = (ms: number) => new Promise((r, _) => setTimeout(r, ms))

export const createJobAgent = () => {

	// Grab the env vars from the docker env
	console.log(`GCODE_FNAME ${process.env.GCODE_FNAME}`)
	if (process.env.GCODE_FNAME == undefined) {
		console.log("No gcode specified.")
		process.exit()
	}

	const gcode: string = readFileSync(`${__dirname}/../gcode/${process.env.GCODE_FNAME}`).toString()
	let state: JobStates = JobStates.AVAILABLE

	const url: string = "http://broker:3000"

	const ioConfig = {
		auth: {
			token: "VirtualBAM",
		},
		extraHeaders: {
			"agent-type": AgentTypes.JOB,
			"group-key": "test",
		},
		path: "/socket/",
	}

	const socket = io(url, ioConfig)
		.on(BrokerEvents.CONNECT, () => {
			console.log(`|- Job ${socket.id} has connected`)
			setTimeout(() => {
				console.log(`|- Job ${socket.id} has closed its connection`)
				socket.close()
			}, 30*60*1000) // Available for 1 hour on the network
		})
		.on("message_error", (msg) => console.log(msg))
		.on("connect_error", (err ) => console.log(err))
		.on(BrokerEvents.ALL_JOBS, (msg) => {
			console.log(`|- Job ${socket.id} received ALL_JOBS message`)
			if (msg.subject == MessageProtocols.MACHINE_IS_LOOKING_FOR_JOBS && state == JobStates.AVAILABLE) {
				console.log(`|- Job ${socket.id} replying with job-is-available`)
				const response: Message = {
					toId: msg.fromId,
					fromId: socket.id,
					subject: MessageProtocols.JOB_IS_AVAILABLE,
					body: {},
				}
				socket.emit(BrokerEvents.DIRECT, response)
			}
		})
		.on(BrokerEvents.DIRECT, async (msg) => {
			console.log(`|- Job ${socket.id} received DIRECT message`)
			if (msg.subject == MessageProtocols.MACHINE_HAS_CHOSEN_A_JOB && state == JobStates.AVAILABLE) {
				console.log(`|- Job ${socket.id} responding with accepted`)
				// check the type of machine.
				const response: Message = {
					toId: msg.fromId,
					fromId: socket.id,
					subject: MessageProtocols.JOB_HAS_ACCEPTED_MACHINES_OFFER,
					body: {
						gcode: gcode,
					},
				}
				socket.emit(BrokerEvents.DIRECT, response)
				state = JobStates.SELECTED
				return
			}
			if (msg.subject == MessageProtocols.MACHINE_HAS_CHOSEN_A_JOB) {
				console.log(`|- Job ${socket.id} responding with decline`)
				const response: Message = {
					toId: msg.fromId,
					fromId: socket.id,
					subject: MessageProtocols.JOB_HAS_DECLINED_MACHINES_OFFER,
					body: {},
				}
				socket.emit(BrokerEvents.DIRECT, response)
				return
			}

		})
}

const main = async () => {
	await wait(1000)
	createJobAgent()
}

main()