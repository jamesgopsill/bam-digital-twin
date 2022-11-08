export enum AgentTypes {
	JOB = "job",
	MACHINE = "machine"
}

export enum BrokerEvents {
	CONNECT = "connect",
	ALL_JOBS = "all_jobs",
	ALL_MACHINES = "all_machines",
	FROM_BROKER = "from_broker",
	DIRECT = "direct"
}

export enum JobStates {
	AVAILABLE = "available",
	SELECTED = "selected"
}

export enum MachineStates {
	AVAILABLE = "available",
	BUSY = "busy"
}

export enum MessageProtocols {
	JOB_IS_AVAILABLE = "job_is_available",
	MACHINE_IS_LOOKING_FOR_JOBS = "machine_is_looking_for_jobs",
	MACHINE_HAS_CHOSEN_A_JOB = "machine_has_chosen_a_job",
	JOB_HAS_ACCEPTED_MACHINES_OFFER = "job_has_accepted_machines_offer",
	JOB_HAS_DECLINED_MACHINES_OFFER = "job_has_declined_machines_offer",
	JOB_COMPLETE = "job_complete",
	MESSAGE_ERROR = "message_error"
}
