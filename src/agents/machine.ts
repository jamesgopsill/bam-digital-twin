import { io, Socket } from "socket.io-client"
import {
	BrokerEvents,
	MachineStates,
	MessageProtocols,
	AgentTypes,
} from "../utils/enums.js"
import { Message } from "../utils/interfaces.js"

const debug = process.env.BAM_DEBUG || false
const timeDilation = parseFloat(process.env.TIME_DILATION) || 1.0

export const createMachineAgent = () => {
	let state: MachineStates = MachineStates.AVAILABLE
	let interval: NodeJS.Timer | null = null
	let jobs: Message[] = []

	const url: string = "http://broker:3000"

	const ioConfig = {
		auth: {
			token: "VirtualBAM",
		},
		extraHeaders: {
			"agent-type": AgentTypes.MACHINE,
			"group-key": "test",
		},
		path: "/socket/",
	}

	const sendQuery = () => {
		if (debug) console.log(`|- MachineAgent: loop, State: ${state}`)
		if (state == MachineStates.AVAILABLE) {
			const msg: Message = {
				fromId: socket.id,
				toId: "",
				subject: MessageProtocols.MACHINE_IS_LOOKING_FOR_JOBS,
				body: {},
			}
			console.log(socket.id)
			socket.emit(BrokerEvents.ALL_JOBS, msg)
			setTimeout(() => {
				selectJob()
			}, 3000)
		}
	}

	const selectJob = () => {
		// Pick the first one
		if (jobs.length > 0) {
			const job = jobs[0]
			const msg: Message = {
				fromId: socket.id,
				toId: job.fromId,
				subject: MessageProtocols.MACHINE_HAS_CHOSEN_A_JOB,
				body: {},
			}
			socket.emit(BrokerEvents.DIRECT, msg)
		}
	}

	const handleConnect = () => {
		// Setting up the interval for looking for a job
		interval = setInterval(sendQuery, 5000)
	}

	const handleDirect = (msg: Message) => {
		if (debug) console.log("|- MachineAgent: Received a direct message")
		if (msg.subject == MessageProtocols.JOB_IS_AVAILABLE) {
			jobs.push(msg)
		}
		if (msg.subject == MessageProtocols.JOB_HAS_ACCEPTED_MACHINES_OFFER) {
			if (debug) console.log("|- MachineAgent: Let's manufacture the job!")
			jobs = []
			clearInterval(interval)
			state = MachineStates.BUSY

			// Get the predicted time from the gcode.
			// console.log(msg.body.gcode.length)
			let gcode = msg.body.gcode.replaceAll("\r\n", "\n")
			gcode = msg.body.gcode.split("\n")
			let printTime = 0
			for (const line of gcode) {
				if (line.startsWith(";TIME_ELAPSED:")) {
					const els = line.split(":")
					printTime = parseFloat(els[1])
				}
			}
			// console.log(printTime)
			printTime = printTime * 1000 * timeDilation

			// Once up and running with the scaling. We can add greater fidelity.
			setTimeout(() => {
				console.log("Job Complete!")
				state = MachineStates.AVAILABLE
				const m: Message = {
					fromId: socket.id,
					toId: msg.fromId,
					subject: MessageProtocols.JOB_COMPLETE,
					body: {},
				}
				socket.emit(BrokerEvents.DIRECT, m)
				interval = setInterval(sendQuery, 5000)
			}, printTime)
		}
		if (msg.subject == MessageProtocols.JOB_HAS_DECLINED_MACHINES_OFFER) {
			jobs = []
		}
	}

	const socket: Socket = io(url, ioConfig)
		.on(BrokerEvents.CONNECT, handleConnect)
		.on(BrokerEvents.MESSAGE_ERROR, (msg) => console.log(msg))
		.on(BrokerEvents.CONNECT_ERROR, (err) => console.log(err))
		.on(BrokerEvents.DIRECT, handleDirect)
}
