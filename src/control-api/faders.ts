import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

export const MeterLevels = z
	.object({
		_afl: z.array(z.number()).optional().default([]),
		_input: z.array(z.number()).optional().default([]),
		_pfl: z.array(z.number()).optional().default([]),
	})
	.prefault({})

export const FaderOptions = z
	.object({
		autooffair: z.boolean().optional().default(false),
		combilogic0: z.boolean().optional().default(false),
		combilogic1: z.boolean().optional().default(false),
		combilogic2: z.boolean().optional().default(false),
		combilogic3: z.boolean().optional().default(false),
		timerreset: z.boolean().optional().default(false),
	})
	.prefault({})

export const GainParams = z.object({
	_active: z.boolean().optional().default(false),
	_hasagain: z.boolean().optional().default(false),
	_hasp48: z.boolean().optional().default(false),
	again: z
		.object({
			_max: z.number(),
			_min: z.number(),
			_step: z.number(),
			inc: z.number(),
			value: z.number(),
		})
		.optional(),
	dgain: z.number().optional().default(0),
	p48: z.boolean().optional().default(false),
	phase: z.boolean().optional().default(false),
})

export const FaderParams = z
	.object({
		gain: GainParams.optional(),
		panbal: z
			.object({
				_active: z.boolean().optional().default(false),
				panbal: z.number().optional().default(0),
			})
			.optional(),
		agc: z.record(z.string(), z.unknown()).optional(),
		compressor: z.record(z.string(), z.unknown()).optional(),
		deesser: z.record(z.string(), z.unknown()).optional(),
		deesser2: z.record(z.string(), z.unknown()).optional(),
		delay: z.record(z.string(), z.unknown()).optional(),
		eq1: z.record(z.string(), z.unknown()).optional(),
		eq2: z.record(z.string(), z.unknown()).optional(),
		eq3: z.record(z.string(), z.unknown()).optional(),
		eq4: z.record(z.string(), z.unknown()).optional(),
		expander: z.record(z.string(), z.unknown()).optional(),
		gate: z.record(z.string(), z.unknown()).optional(),
		limiter: z.record(z.string(), z.unknown()).optional(),
		r128agc: z.record(z.string(), z.unknown()).optional(),
		subsonic: z.record(z.string(), z.unknown()).optional(),
		swc: z.record(z.string(), z.unknown()).optional(),
		varfilter1: z.record(z.string(), z.unknown()).optional(),
		varfilter2: z.record(z.string(), z.unknown()).optional(),
	})
	.prefault({})

export const BusParams = z
	.object({
		automix: z
			.object({
				_active: z.boolean().optional().default(false),
				_gainreduction: z.number().optional().default(0),
				group: z.number().optional().default(0),
				on: z.boolean().optional().default(false),
				passive: z.boolean().optional().default(false),
				weight: z.number().optional().default(0),
			})
			.optional(),
		bus: z.record(z.string(), z.unknown()).optional().default({}),
		preparation: z
			.object({
				_active: z.boolean().optional().default(false),
				gain: z.number().optional().default(0),
			})
			.optional(),
	})
	.prefault({})

export const Fader = z.object({
	_category: z.number().optional(),
	_channelcnt: z.number().optional().default(1),
	_defaultlabel: z.string().optional().default(''),
	_faderstart: z.boolean().optional().default(false),
	_lastloadedsnap: z.string().optional().default(''),
	_poolavailable: z.boolean().optional(),
	_readystate: z.boolean().optional(),
	_usecleanfeed: z.number().optional().default(0),
	_paramlist: z.array(z.unknown()).optional().default([]),

	altinput: z.boolean().optional().default(false),
	autolevelgain: z.record(z.string(), z.unknown()).optional(),
	busparams: BusParams,
	bypass: z.boolean().optional().default(false),
	fader: z.number().optional().default(-160),
	isolate: z.boolean().optional().default(false),
	label: z.string().optional().default(''),
	memo: z.boolean().optional().default(false),
	meter: MeterLevels,
	mutegroups: z.record(z.string(), z.boolean()).optional().default({}),
	offair: z.boolean().optional().default(false),
	on: z.boolean().optional().default(false),
	options: FaderOptions,
	params: FaderParams,
	pfl1: z.boolean().optional().default(false),
	pfl2: z.boolean().optional().default(false),
	preparation: z.boolean().optional().default(false),
	solo: z.boolean().optional().default(false),
	sourceid: z.number().optional().default(0),
	vcagroup: z.number().optional().default(0),
	voice: z.boolean().optional().default(false),
})

export type Fader = z.infer<typeof Fader>

const FaderId = z.string()
export const FaderRecord = z.record(FaderId, Fader)
export type FaderRecord = z.infer<typeof FaderRecord>

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
	payload: FaderRecord,
})

const Response = z.union([ResponseSuccess, ResponseError])

export async function fetchFaders(self: ModuleInstance, mixerId = '0'): Promise<FaderRecord> {
	return new Promise((resolve, reject) => {
		self.websocket.get(`/audio/mixers/${mixerId}/faders/`, (response) => {
			const result = Response.safeParse(response)
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
