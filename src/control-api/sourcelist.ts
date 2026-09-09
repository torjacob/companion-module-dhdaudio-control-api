import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

export const Source = z.object({
	_defaultlabel: z.string().optional().default(''),
	_label: z.string().optional().default(''),
	_sourceid: z.number(),
})

export type Source = z.infer<typeof Source>

export const SourceList = z.array(Source)
export type SourceList = z.infer<typeof SourceList>

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
	payload: SourceList,
})

const Response = z.union([ResponseSuccess, ResponseError])

export async function fetchSourcelist(self: ModuleInstance, mixerId = '0'): Promise<SourceList> {
	return new Promise((resolve, reject) => {
		self.websocket.get(`/audio/mixers/${mixerId}/sourcelist/`, (response) => {
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
