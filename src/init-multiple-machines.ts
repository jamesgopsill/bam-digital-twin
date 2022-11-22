import { wait } from "./utils/wait.js"
import { createMachineAgent } from "./agents/machine.js"

const nJobs = parseInt(process.env.N_MACHINES) || 5

const main = async () => {
	await wait(1000)
	for (let i = 0; i < nJobs; i++) {
		createMachineAgent()
	}
}

main()