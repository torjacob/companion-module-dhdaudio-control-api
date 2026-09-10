import * as z from 'zod'
import {
	combineRgb,
	type CompanionActionDefinitions,
	type CompanionButtonPresetDefinition,
	type CompanionFeedbackDefinitions,
	type CompanionPresetDefinitions,
	type CompanionVariableDefinition,
	type CompanionVariableValues,
	type SomeCompanionActionInputField,
	type SomeCompanionFeedbackInputField,
} from '@companion-module/base'
import type { ResponseSubscriptionUpdate } from '@dhdaudio/control-api'
import type { FaderRecord } from '../control-api/faders.js'
import type { MixerRecord } from '../control-api/mixers.js'
import type { ModuleInstance } from '../main.js'

function getFaderLabel(id: string, values: FaderRecord[string]): string {
	return values.label || values._defaultlabel || `Fader ${id}`
}

function getFaderEntries(mixers: MixerRecord): Array<[string, string, FaderRecord[string]]> {
	return Object.entries(mixers).flatMap(([mixerId, mixer]) =>
		Object.entries(mixer.faders ?? {}).map(([faderId, fader]): [string, string, FaderRecord[string]] => [
			mixerId,
			faderId,
			fader,
		]),
	)
}
export function init(
	self: ModuleInstance,
	mixers: MixerRecord,
): {
	variables: ReadonlyArray<CompanionVariableDefinition>
	feedback: CompanionFeedbackDefinitions
	actions: CompanionActionDefinitions
	presets: CompanionPresetDefinitions
} {
	const faderEntries = getFaderEntries(mixers)

	// 1. Seed initial variable values into Companion memory from the mixers payload
	const initialValues: CompanionVariableValues = {}
	faderEntries.forEach(([mixerId, faderId, fader]) => {
		if (fader.on !== undefined) {
			initialValues[`fader_${mixerId}.${faderId}_on`] = fader.on
		}
		if (fader.fader !== undefined) {
			initialValues[`fader_${mixerId}.${faderId}_level`] = fader.fader
		}
	})
	if (Object.keys(initialValues).length > 0) {
		self.setVariableValues(initialValues)
	}

	// 2. Generate definitions
	const variables = genVariables(faderEntries)
	const feedback = genFeedbacks(self, mixers)
	const actions = genActions(self, mixers)
	const presets = genPresets(faderEntries)

	return { variables, feedback, actions, presets }
}

function genVariables(
	faderEntries: Array<[string, string, FaderRecord[string]]>,
): ReadonlyArray<CompanionVariableDefinition> {
	return faderEntries.flatMap(([mixerId, faderId, values]) => {
		const label = getFaderLabel(faderId, values)
		return [
			{
				variableId: `fader_${mixerId}.${faderId}_level`,
				name: `Fader ${mixerId}.${faderId} (${label}) Level`,
			},
			{
				variableId: `fader_${mixerId}.${faderId}_on`,
				name: `Fader ${mixerId}.${faderId} (${label}) On State`,
			},
			{
				variableId: `fader_${mixerId}.${faderId}_faderstart`,
				name: `Fader ${mixerId}.${faderId} (${label}) Faderstart State`,
			},
		]
	})
}

function genFeedbacks(self: ModuleInstance, mixers: MixerRecord): CompanionFeedbackDefinitions {
	const mixerEntries = Object.entries(mixers)
	const defaultMixer = mixerEntries[0]?.[0] ?? '0'

	const mixerDropdown: SomeCompanionFeedbackInputField = {
		id: 'mixerId',
		type: 'dropdown',
		label: 'Mixer',
		default: defaultMixer,
		choices: mixerEntries.map(([mId, mixer]) => ({
			id: mId,
			label: mixer._name ? `${mId} - ${mixer._name}` : `Mixer ${mId}`,
		})),
	}

	const faderDropdowns: SomeCompanionFeedbackInputField[] = mixerEntries.map(([mixerId, mixer]) => {
		const faders = Object.entries(mixer.faders ?? {})
		return {
			id: `faderId_m${mixerId}`,
			type: 'dropdown',
			label: 'Fader',
			default: faders[0]?.[0] ?? '0',
			choices: faders.map(([fId, val]) => ({
				id: fId,
				label: `${fId} - ${getFaderLabel(fId, val)}`,
			})),
			isVisibleExpression: `$(options:mixerId) == '${mixerId}'`,
		}
	})
	return {
		new_fader_on_off: {
			name: 'Fader On/Off',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(102, 0, 0),
			},
			options: [mixerDropdown, ...faderDropdowns],
			callback: ({ options }) => {
				const mixerId = `${options.mixerId ?? '0'}`
				const faderId = `${options[`faderId_m${mixerId}`] ?? '0'}`
				const currentOn = self.getVariableValue(`fader_${mixerId}.${faderId}_on`)
				return Boolean(currentOn)
			},
			subscribe: ({ options }) => {
				const mixerId = `${options.mixerId ?? '0'}`

				if (!mixers[mixerId]) return

				const faderId = `${options[`faderId_m${mixerId}`] ?? '0'}`
				const path = `/audio/mixers/${mixerId}/faders/${faderId}/on`

				self.websocket.subscribe(path)

				self.websocket.get(
					path,
					(response) => {
						const onState = z.boolean().parse(response.payload)
						self.setVariableValues({
							[`fader_${mixerId}.${faderId}_on`]: onState,
						})
						self.checkFeedbacks('new_fader_on_off')
					},
					(response: { error: { message: string } }) => {
						self.log('warn', `Failed fetching initial state for ${path}: ${response.error.message}`)
					},
				)
			},
		},
		new_fader_faderstart: {
			name: 'Fader faderstart (On / Off)',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(102, 0, 0),
			},
			options: [mixerDropdown, ...faderDropdowns],
			callback: ({ options }) => {
				const mixerId = `${options.mixerId ?? '0'}`
				const faderId = `${options[`faderId_m${mixerId}`] ?? '0'}`
				const currentFaderstart = self.getVariableValue(`fader_${mixerId}.${faderId}_faderstart`)
				return Boolean(currentFaderstart)
			},
			subscribe: ({ options }) => {
				const mixerId = `${options.mixerId ?? '0'}`

				if (!mixers[mixerId]) return

				const faderId = `${options[`faderId_m${mixerId}`] ?? '0'}`
				const path = `/audio/mixers/${mixerId}/faders/${faderId}/_faderstart`

				self.websocket.subscribe(path)

				self.websocket.get(
					path,
					(response) => {
						const faderstartState = z.boolean().parse(response.payload)
						self.setVariableValues({
							[`fader_${mixerId}.${faderId}_faderstart`]: faderstartState,
						})
						self.checkFeedbacks('new_fader_faderstart')
					},
					(response: { error: { message: string } }) => {
						self.log('warn', `Failed fetching initial state for ${path}: ${response.error.message}`)
					},
				)
			},
		},
		new_fader_level: {
			name: 'Fader Level',
			type: 'value',
			options: [mixerDropdown, ...faderDropdowns],
			callback: ({ options }) => {
				const mixerId = `${options.mixerId ?? '0'}`
				const faderId = `${options[`faderId_m${mixerId}`] ?? '0'}`
				const level = self.getVariableValue(`fader_${mixerId}.${faderId}_level`)
				return typeof level === 'number' || typeof level === 'string' ? level : -159
			},
			subscribe: ({ options }) => {
				const mixerId = `${options.mixerId ?? '0'}`
				if (!mixers[mixerId]) return

				const faderId = `${options[`faderId_m${mixerId}`] ?? '0'}`
				const levelPath = `/audio/mixers/${mixerId}/faders/${faderId}/fader`

				self.websocket.subscribe(levelPath)
				self.websocket.get(
					levelPath,
					(response) => {
						let levelVal: number | undefined
						if (typeof response.payload === 'number') {
							levelVal = response.payload
						} else if (typeof response.payload === 'object' && response.payload !== null) {
							const parsed = z.object({ fader: z.number() }).safeParse(response.payload)
							if (parsed.success) levelVal = parsed.data.fader
						}

						if (levelVal !== undefined) {
							self.setVariableValues({
								[`fader_${mixerId}.${faderId}_level`]: levelVal,
							})
							self.checkFeedbacks('new_fader_level')
						}
					},
					(response: { error: { message: string } }) => {
						self.log('warn', `Failed fetching initial level for ${levelPath}: ${response.error.message}`)
					},
				)
			},
		},
	}
}

function genActions(self: ModuleInstance, mixers: MixerRecord): CompanionActionDefinitions {
	const mixerEntries = Object.entries(mixers)
	const defaultMixer = mixerEntries[0]?.[0] ?? '0'

	const mixerDropdown: SomeCompanionActionInputField = {
		id: 'mixerId',
		type: 'dropdown',
		label: 'Mixer',
		default: defaultMixer,
		choices: mixerEntries.map(([mId, mixer]) => ({
			id: mId,
			label: mixer._name ? `${mId} - ${mixer._name}` : `Mixer ${mId}`,
		})),
	}

	const faderDropdowns: SomeCompanionActionInputField[] = mixerEntries.map(([mixerId, mixer]) => {
		const faders = Object.entries(mixer.faders ?? {})
		return {
			id: `faderId_m${mixerId}`,
			type: 'dropdown',
			label: 'Fader',
			default: faders[0]?.[0] ?? '0',
			choices: faders.map(([fId, val]) => ({
				id: fId,
				label: `${fId} - ${getFaderLabel(fId, val)}`,
			})),
			isVisibleExpression: `$(options:mixerId) == '${mixerId}'`,
		}
	})
	return {
		fader_level_set: {
			name: 'Set Fader Level (New)',
			options: [
				mixerDropdown,
				...faderDropdowns,
				{
					id: 'level',
					type: 'textinput',
					label: 'Level',
					description: 'dB or $(custom:variable), -160 to 0',
					default: '0',
					useVariables: true,
				},
			],
			callback: async ({ options }) => {
				const mixerId = `${options.mixerId ?? '0'}`
				const faderId = `${options[`faderId_m${mixerId}`] ?? '0'}`

				const rawLevelStr = await self.parseVariablesInString(String(options.level ?? '0'))
				const level = parseFloat(rawLevelStr)

				if (isNaN(level)) {
					self.log('error', `Invalid fader level value: "${rawLevelStr}"`)
					return
				}

				const path = `/audio/mixers/${mixerId}/faders/${faderId}/fader`

				self.websocket.set(
					path,
					level,
					() => void 0,
					(response: { error: { message: string } }) => {
						self.log('error', `Failed setting level on ${path}: ${response.error.message}`)
					},
				)
			},
		},
	}
}

function genPresets(faderEntries: Array<[string, string, FaderRecord[string]]>): CompanionPresetDefinitions {
	return faderEntries.reduce((acc, [mixerId, faderId, values]) => {
		const label = getFaderLabel(faderId, values)
		const presetKey = `fader-level2-0db-m${mixerId}-f${faderId}`

		return {
			...acc,
			[presetKey]: {
				type: 'button',
				category: `Fader ${mixerId}.${faderId} (${label})`,
				name: `M${mixerId} F${faderId} Set 0dB`,
				style: {
					text: `${label}\n0 dB`,
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0),
				},
				steps: [
					{
						down: [
							{
								actionId: 'fader_level_set',
								options: {
									mixerId: mixerId,
									[`faderId_m${mixerId}`]: faderId,
									level: 0,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			} satisfies CompanionButtonPresetDefinition,
		}
	}, {})
}

export function onSubscriptionUpdate(self: ModuleInstance, update: ResponseSubscriptionUpdate): void {
	const rawPayload = (update as Record<string, unknown>).payload ?? update

	const updateParser = z.object({
		audio: z.object({
			mixers: z.record(
				z.string(),
				z.object({
					faders: z.record(
						z.string(),
						z.object({
							on: z.boolean().optional(),
							_faderstart: z.boolean().optional(),
							fader: z.number().optional(),
						}),
					),
				}),
			),
		}),
	})

	const parsed = updateParser.safeParse(rawPayload)
	if (!parsed.success) return

	const variableUpdates: CompanionVariableValues = {}

	Object.entries(parsed.data.audio.mixers).forEach(([mixerId, mixer]) => {
		Object.entries(mixer.faders).forEach(([faderId, fader]) => {
			if (fader.on !== undefined) {
				variableUpdates[`fader_${mixerId}.${faderId}_on`] = fader.on
			}
			if (fader.fader !== undefined) {
				variableUpdates[`fader_${mixerId}.${faderId}_level`] = fader.fader
			}
		})
	})

	if (Object.keys(variableUpdates).length > 0) {
		self.setVariableValues(variableUpdates)
		self.checkFeedbacks()
	}
}
