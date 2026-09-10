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

interface BooleanParamConfig {
	id: string
	name: string
	pathKey: string
	variableSuffix: string
	varName: string
}

const BOOLEAN_PARAMS: BooleanParamConfig[] = [
	{ id: 'new_fader_on_off', name: 'Fader State: On', pathKey: 'on', variableSuffix: 'on', varName: 'On State' },
	{
		id: 'new_fader_faderstart',
		name: 'Fader State: Faderstart',
		pathKey: '_faderstart',
		variableSuffix: 'faderstart',
		varName: 'Faderstart State',
	},
	{
		id: 'new_fader_offair',
		name: 'Fader State: OffAir',
		pathKey: 'offair',
		variableSuffix: 'offair',
		varName: 'OffAir State',
	},
	{ id: 'new_fader_pfl1', name: 'Fader State: PFL1', pathKey: 'pfl1', variableSuffix: 'pfl1', varName: 'PFL1 State' },
	{ id: 'new_fader_pfl2', name: 'Fader State: PFL2', pathKey: 'pfl2', variableSuffix: 'pfl2', varName: 'PFL2 State' },
	{
		id: 'new_fader_pool_available',
		name: 'Fader State: Pool Available',
		pathKey: '_pool_available',
		variableSuffix: 'poolavailable',
		varName: 'Pool State',
	},
	{
		id: 'new_fader_readystate',
		name: 'Fader State: Ready',
		pathKey: '_readystate',
		variableSuffix: 'readystate',
		varName: 'Readystate',
	},
	{
		id: 'new_fader_altinput',
		name: 'Fader State: Altinput',
		pathKey: 'altinput',
		variableSuffix: 'altinput',
		varName: 'Altinput State',
	},
]

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

		const specialVars: CompanionVariableDefinition[] = [
			{
				variableId: `fader_${mixerId}.${faderId}_level`,
				name: `Fader ${mixerId}.${faderId} (${label}) Level`,
			},
		]

		const booleanVars: CompanionVariableDefinition[] = BOOLEAN_PARAMS.map((config) => ({
			variableId: `fader_${mixerId}.${faderId}_${config.variableSuffix}`,
			name: `Fader ${mixerId}.${faderId} (${label}) ${config.varName}`,
		}))

		return [...specialVars, ...booleanVars]
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

	const booleanDefinitions = BOOLEAN_PARAMS.reduce<CompanionFeedbackDefinitions>((acc, config) => {
		acc[config.id] = {
			name: config.name,
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(102, 0, 0) },
			options: [mixerDropdown, ...faderDropdowns],
			callback: ({ options }) => {
				const mixerId = `${options.mixerId ?? '0'}`
				const faderId = `${options[`faderId_m${mixerId}`] ?? '0'}`
				const currentVal = self.getVariableValue(`fader_${mixerId}.${faderId}_${config.variableSuffix}`)
				return Boolean(currentVal)
			},
			subscribe: ({ options }) => {
				const mixerId = `${options.mixerId ?? '0'}`
				if (!mixers[mixerId]) return

				const faderId = `${options[`faderId_m${mixerId}`] ?? '0'}`
				const path = `/audio/mixers/${mixerId}/faders/${faderId}/${config.pathKey}`

				self.websocket.subscribe(path)
				self.websocket.get(
					path,
					(response) => {
						const parsedVal = z.boolean().parse(response.payload)
						if (parsedVal !== undefined) {
							self.setVariableValues({
								[`fader_${mixerId}.${faderId}_${config.variableSuffix}`]: parsedVal,
							})
							self.checkFeedbacks(config.id)
						}
					},
					(response: { error: { message: string } }) => {
						self.log('warn', `Failed fetching initial state for ${path}: ${response.error.message}`)
					},
				)
			},
		}
		return acc
	}, {})

	return {
		...booleanDefinitions,
		new_fader_level: {
			name: 'Fader State: Level',
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
		const presetKey = `fader-0db-f${mixerId}.${faderId}`

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
					faders: z.record(z.string(), z.record(z.string(), z.unknown())),
				}),
			),
		}),
	})

	const parsed = updateParser.safeParse(rawPayload)
	if (!parsed.success) return

	const variableUpdates: CompanionVariableValues = {}

	Object.entries(parsed.data.audio.mixers).forEach(([mixerId, mixer]) => {
		Object.entries(mixer.faders).forEach(([faderId, fader]) => {
			if (typeof fader.fader === 'number') {
				variableUpdates[`fader_${mixerId}.${faderId}_level`] = fader.fader
			}

			BOOLEAN_PARAMS.forEach((config) => {
				const val = fader[config.pathKey]
				if (typeof val === 'boolean') {
					variableUpdates[`fader_${mixerId}.${faderId}_${config.variableSuffix}`] = val
				}
			})
		})
	})

	if (Object.keys(variableUpdates).length > 0) {
		self.setVariableValues(variableUpdates)
		self.checkFeedbacks()
	}
}
