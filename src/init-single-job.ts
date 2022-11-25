import { createJobAgent } from "./agents/job.js"
import { wait } from "./utils/wait.js"

const gcodeFileName = process.env.PROFILE || "test.gcode"

const main = async () => {
	await wait(1000)
	createJobAgent(gcodeFileName)
}

main()
