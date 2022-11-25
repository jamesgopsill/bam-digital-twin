import { wait } from "./utils/wait.js"
import { createMachineAgent } from "./agents/machine.js"

const main = async () => {
	await wait(2000)
	createMachineAgent()
}

main()
