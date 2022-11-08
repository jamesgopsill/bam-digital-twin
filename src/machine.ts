import { io, Socket } from "socket.io-client"
import { BrokerEvents, MachineStates, MessageProtocols, AgentTypes } from "./enums.js"
import { Message } from "./interfaces.js"

const wait = (ms: number) => new Promise((r, _) => setTimeout(r, ms))

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
		console.log(`|- MachineAgent: loop, State: ${state}`)
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
		console.log("|- MachineAgent: Received a direct message")
		if (msg.subject == MessageProtocols.JOB_IS_AVAILABLE) {
			jobs.push(msg)
		}
		if (msg.subject == MessageProtocols.JOB_HAS_ACCEPTED_MACHINES_OFFER) {
			console.log("|- MachineAgent: Let's manufacture the job!")
			jobs = []
			interval = null
			state = MachineStates.BUSY
			// Once up and running with the scaling. We can add greater fidelity.
			setTimeout(() => {
				console.log("Job Complete!")
				state = MachineStates.AVAILABLE
				interval = setInterval(sendQuery, 5000)
			}, 10000)
		}
		if (msg.subject == MessageProtocols.JOB_HAS_DECLINED_MACHINES_OFFER) {
			jobs = []
		}
	}

	const socket: Socket = io(url, ioConfig)
		.on(BrokerEvents.CONNECT, handleConnect)
		.on("message_error", (msg) => console.log(msg))
		.on("connect_error", (err ) => console.log(err))
		.on(BrokerEvents.DIRECT, handleDirect)

}

const main = async () => {
	await wait(2000)
	createMachineAgent()
}

main()