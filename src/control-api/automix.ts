import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

export const Automix = z.object({
	_active: z.boolean(),
	hold: z.numnber(),
	maxattenuation: z.number(),
	passiveattenuation: z.number(),
	ratio: z.numnber(),
	release: z.numnber(),
})

const AutomixId = z.string()
export const AutomixRecord = z.record(AutomixId, Automix)
export type AutomixRecord = z.infer<typeof AutomixRecord>

const ResponseSuccess = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(true),
	payload: AutomixRecord,
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

export async function fetchAutomix(self: ModuleInstance, mixerId = '0'): Promise<AutomixRecord> {
	return new Promise((resolve, reject) => {
		self.websocket.get(`/audio/mixers/${mixerId}/automix/`, (response) => {
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
