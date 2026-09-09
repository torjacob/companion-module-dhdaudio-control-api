import * as z from 'zod'
import type { ModuleInstance } from '../main.js'
import { MutegroupRecord } from './mutegroups.js'
import { CleanfeedRecord } from './cleanfeeds.js'
import { AutomixRecord } from './automix.js'
import { SourceList } from './sourcelist.js'
import { MixerOptions } from './options.js'

export const Mixer = z.object({
	_lastloadedsnap: z.string().optional().default('-'),
	_name: z.string().optional().default('-'),
	automix: AutomixRecord.optional().default({}),
	cleanfeeds: CleanfeedRecord.optional().default({}),
	mutegroups: MutegroupRecord.optional().default({}),
	options: MixerOptions,
	//  faders: faderRecord.optional().default({}),
	sourcelist: SourceList.optional().default([]),
})

const MixerId = z.string()
const MixerRecord = z.record(MixerId, Mixer)
export type MixerRecord = z.infer<typeof MixerRecord>

const ResponseSuccess = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(true),
	payload: MixerRecord,
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

export async function fetchMixers(self: ModuleInstance): Promise<MixerRecord> {
	return new Promise((resolve, reject) => {
		self.websocket.get('/audio/mixers', (response) => {
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
