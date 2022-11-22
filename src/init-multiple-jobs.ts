import { createJobAgent } from "./agents/job.js"
import { wait } from "./utils/wait.js"

const nJobs = parseInt(process.env.N_JOBS) || 5

const main = async () => {
	await wait(2000)
	for (let i = 0; i < nJobs; i++) {
		createJobAgent()
	}
}

main()