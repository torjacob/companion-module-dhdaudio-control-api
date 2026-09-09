import {
	combineRgb,
	type CompanionActionDefinitions,
	type CompanionButtonPresetDefinition,
	type CompanionFeedbackDefinitions,
	type CompanionPresetDefinitions,
	type CompanionVariableDefinition,
	type SomeCompanionActionInputField,
} from '@companion-module/base'
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

	const variables = genVariables(faderEntries)
	const feedback = genFeedbacks(self, faderEntries)
	const actions = genActions(self, mixers)
	const presets = genPresets(faderEntries)

	return { variables, feedback, actions, presets }
}

function genVariables(
	faderEntries: Array<[string, string, FaderRecord[string]]>,
): ReadonlyArray<CompanionVariableDefinition> {
	return faderEntries.map(([mixerId, faderId, values]) => ({
		variableId: `fader_m${mixerId}_f${faderId}_level`,
		name: `Mixer ${mixerId} Fader ${getFaderLabel(faderId, values)} Level`,
	}))
}

function genFeedbacks(
	_self: ModuleInstance,
	_faderEntries: Array<[string, string, FaderRecord[string]]>,
): CompanionFeedbackDefinitions {
	return {}
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
