import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

const MutegroupId = z.string()
export const MutegroupRecord = z.record(MutegroupId, z.boolean())
export type MutegroupRecord = z.infer<typeof MutegroupRecord>

const ResponseSuccess = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(true),
	payload: MutegroupRecord,
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

export async function fetchMutegroups(self: ModuleInstance, mixerId = '0'): Promise<MutegroupRecord> {
	return new Promise((resolve, reject) => {
		self.websocket.get(`/audio/mixers/${mixerId}/mutegroups/`, (response) => {
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
