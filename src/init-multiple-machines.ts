import { wait } from "./utils/wait.js"
import { createMachineAgent } from "./agents/machine.js"

const nMachines = parseInt(process.env.N_MACHINES) || 5

const main = async () => {
	await wait(1000)
	console.log(`Machines to add: ${nMachines}`)
	for (let i = 0; i < nMachines; i++) {
		createMachineAgent()
	}
}

main()
