import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

export const Cleanfeed = z.object({
	_active: z.boolean(),
	cut: z.boolean(),
	n: z.boolean(),
	outgain: z.number(),
	outsel: z.boolean(),
	srcsel: z.number(),
})

const CleanfeedId = z.string()
export const CleanfeedRecord = z.record(CleanfeedId, Cleanfeed)
export type CleanfeedRecord = z.infer<typeof CleanfeedRecord>

const ResponseSuccess = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(true),
	payload: CleanfeedRecord,
})

const ResponseError = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(false),
	error: z.object({
		code: z.number(),
		message: z.string(),
	}),
})

const Response = z.union([ResponseSuccess, ResponseError])

export async function fetchCleanfeeds(self: ModuleInstance, mixerId = '0'): Promise<CleanfeedRecord> {
	return new Promise((resolve, reject) => {
		self.websocket.get(`/audio/mixers/${mixerId}/cleanfeeds/`, (response) => {
			const result = z.safeParse(Response, response)
			if (!result.success) {
				return reject(new Error(result.error.message))
			}

			if (result.data.success === false) {
				return reject(new Error(result.data.error.message))
			}

			return resolve(result.data.payload)
		})
	})
}
