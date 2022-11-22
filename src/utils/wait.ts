// A little async wait utility function.
export const wait = (ms: number) => new Promise((r, _) => setTimeout(r, ms))
