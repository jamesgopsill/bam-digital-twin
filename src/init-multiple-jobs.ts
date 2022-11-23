import { createJobAgent } from "./agents/job.js"
import { wait } from "./utils/wait.js"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import path from "path"

const profileFileName = process.env.PROFILE || "example_job.csv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let contents: string = readFileSync(
	`${__dirname}/../expts/${profileFileName}`
).toString()

let lines = contents.split("\n")
lines.shift() // Remove header
console.log(lines)
const profile = []
let i = 0
for (let line of lines) {
	const els = line.split(",")
	profile.push({
		"file": els[1],
		"interArrivalTime": parseInt(els[0])
	})
}

const main = async () => {

	for (const job of profile) {
		await wait(job.interArrivalTime)
		console.log(`Creating Job`)
		createJobAgent(job.file)
	}

}

main()