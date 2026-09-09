import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

export const PflOptions = z
	.object({
		afl: z.boolean().optional().default(false),
		aflwhenon: z.boolean().optional(),
		mix: z.boolean().optional().default(false),
		reset: z.boolean().optional().default(false),
		resetfader: z.boolean().optional().default(false),
		return: z.boolean().optional().default(false),
	})
	.prefault({})

export type PflOptions = z.infer<typeof PflOptions>

export const MixerOptions = z
	.object({
		directoffair: z.boolean().optional().default(false),
		pfl1: PflOptions,
		pfl2: PflOptions,
	})
	.prefault({})

export type MixerOptions = z.infer<typeof MixerOptions>

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

const ResponseSuccess = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(true),
	payload: MixerOptions,
})

const Response = z.union([ResponseSuccess, ResponseError])

export async function fetchMixerOptions(self: ModuleInstance, mixerId = '0'): Promise<MixerOptions> {
	return new Promise((resolve, reject) => {
		self.websocket.get(`/audio/mixers/${mixerId}/options/`, (response) => {
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
