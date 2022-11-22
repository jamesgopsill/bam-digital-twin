import { createJobAgent } from "./agents/job.js"

const wait = (ms: number) => new Promise((r, _) => setTimeout(r, ms))

const main = async () => {
	await wait(1000)
	createJobAgent()
}

main()