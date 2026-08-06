/** The off-thread half of worker-lease-spike.mts.
 *  Plain .mjs on purpose: a worker_thread does not inherit the tsx loader, and the
 *  question being answered is a RUNTIME one (is the main thread free?), so it calls
 *  unpdf directly — the same CPU work extractPdfText wraps. */
import { readFile } from "node:fs/promises"
import { parentPort, workerData } from "node:worker_threads"
import { extractText, getDocumentProxy } from "unpdf"

const bytes = new Uint8Array(await readFile(workerData.file))
const pdf = await getDocumentProxy(new Uint8Array(bytes))
const { totalPages, text } = await extractText(pdf)
parentPort?.postMessage({ units: totalPages, chars: Array.isArray(text) ? text.join("").length : String(text).length })
