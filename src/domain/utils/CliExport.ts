import { Recommendation, ParameterChange, InavParameter, Axis } from '../types/Analysis'
import { PidProfile, FilterSettings } from '../types/LogFrame'
import { CLI_OPTIONS } from '../../lib/inav/cliOptions'

/**
 * Maps InavParameter to CLI command patterns for per-axis PID params.
 * Note: pidFeedforward is NOT here because INAV has no mc_ff_* CLI commands —
 * feedforward is set via the 4th value in the PID compound header and must be
 * changed in the Configurator PID tab.
 */
const PER_AXIS_PARAMS: Record<string, { cliPrefix: string; profileField: (axis: Axis) => string }> = {
  pidPGain: { cliPrefix: 'mc_p', profileField: (a) => `${a}P` },
  pidIGain: { cliPrefix: 'mc_i', profileField: (a) => `${a}I` },
  pidDGain: { cliPrefix: 'mc_d', profileField: (a) => `${a}D` },
  pidCdGain: { cliPrefix: 'mc_cd', profileField: (a) => `${a}Cd` },
}

/** Parameters that must be changed in Configurator, not via CLI */
const CONFIGURATOR_ONLY_PARAMS: Record<string, { profileField: (axis: Axis) => string; displayName: string }> = {
  pidFeedforward: { profileField: (a) => `${a}FF`, displayName: 'Feedforward' },
}

const GLOBAL_PARAM_MAP: Partial<Record<InavParameter, string>> = {
  gyroMainLpfHz: 'gyro_main_lpf_hz',
  gyroDynLpfMinHz: 'gyro_dyn_lpf_min_hz',
  gyroDynLpfMaxHz: 'gyro_dyn_lpf_max_hz',
  dtermLpfHz: 'dterm_lpf_hz',
  dynamicGyroNotchEnabled: 'dynamic_gyro_notch_enabled',
  dynamicGyroNotchQ: 'dynamic_gyro_notch_q',
  dynamicGyroNotchMinHz: 'dynamic_gyro_notch_min_hz',
  gyroAdaptiveFilterMinHz: 'gyro_adaptive_filter_min_hz',
  gyroAdaptiveFilterMaxHz: 'gyro_adaptive_filter_max_hz',
  tpaRate: 'tpa_rate',
  tpaBreakpoint: 'tpa_breakpoint',
  mcItermRelaxCutoff: 'mc_iterm_relax_cutoff',
}

/**
 * Human-readable display names for INAV parameters
 */
export const PARAMETER_DISPLAY_NAMES: Record<InavParameter, string> = {
  pidPGain: 'P Gain',
  pidIGain: 'I Gain',
  pidDGain: 'D Gain',
  pidCdGain: 'D-Boost',
  pidFeedforward: 'Feedforward',
  gyroMainLpfHz: 'Gyro LPF',
  gyroDynLpfMinHz: 'Gyro Dyn LPF Min',
  gyroDynLpfMaxHz: 'Gyro Dyn LPF Max',
  dtermLpfHz: 'D-term LPF',
  dynamicGyroNotchEnabled: 'Dyn Notch',
  dynamicGyroNotchQ: 'Dyn Notch Q',
  dynamicGyroNotchMinHz: 'Dyn Notch Min',
  gyroAdaptiveFilterMinHz: 'Adaptive Filter Min',
  gyroAdaptiveFilterMaxHz: 'Adaptive Filter Max',
  tpaRate: 'TPA Rate',
  tpaBreakpoint: 'TPA Breakpoint',
  mcItermRelaxCutoff: 'I-term Relax Cutoff',
}

/**
 * Get the CLI parameter name for an InavParameter + axis combo
 */
export function getCliName(parameter: InavParameter, axis?: Axis): string {
  const perAxis = PER_AXIS_PARAMS[parameter]
  if (perAxis && axis) {
    return `${perAxis.cliPrefix}_${axis}`
  }
  return GLOBAL_PARAM_MAP[parameter] ?? parameter
}

/**
 * Parse a recommendedChange string and compute the new value
 * Returns [newValue, isResolved] where isResolved=false means we couldn't compute
 */
export function resolveChange(
  recommendedChange: string,
  currentValue: number | undefined,
  isPerAxisPid: boolean
): [number | null, boolean] {
  const trimmed = recommendedChange.trim()

  // Percentage change: "+5%", "-10%"
  const pctMatch = trimmed.match(/^([+-])(\d+(?:\.\d+)?)%$/)
  if (pctMatch) {
    if (currentValue === undefined) return [null, false]
    const sign = pctMatch[1] === '+' ? 1 : -1
    const pct = parseFloat(pctMatch[2])
    return [Math.round(currentValue * (1 + sign * pct / 100)), true]
  }

  // Relative change: "+0.3", "-0.2", "+10", "-50"
  const relMatch = trimmed.match(/^([+-])(\d+(?:\.\d+)?)$/)
  if (relMatch) {
    const sign = relMatch[1] === '+' ? 1 : -1
    const delta = parseFloat(relMatch[2])

    if (isPerAxisPid) {
      // For PID params, relative means scale (e.g. +0.3 = +30%)
      if (currentValue === undefined) return [null, false]
      return [Math.round(currentValue * (1 + sign * delta)), true]
    } else {
      // For non-PID params, relative means additive
      if (currentValue === undefined) return [null, false]
      return [Math.round(currentValue + sign * delta), true]
    }
  }

  // Absolute value: "32", "3", "2"
  const absMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/)
  if (absMatch) {
    return [Math.round(parseFloat(absMatch[1])), true]
  }

  return [null, false]
}

/**
 * Look up the current PID value from the profile
 */
export function getPidValue(
  pidProfile: PidProfile | undefined,
  parameter: InavParameter,
  axis: Axis | undefined
): number | undefined {
  if (!pidProfile || !axis) return undefined

  const mapping = PER_AXIS_PARAMS[parameter] ?? CONFIGURATOR_ONLY_PARAMS[parameter]
  if (!mapping) return undefined

  const fieldName = mapping.profileField(axis)
  return (pidProfile as Record<string, number | undefined>)[fieldName]
}

/**
 * Look up current value for a global parameter from profile/filter settings
 */
export function getGlobalValue(
  parameter: InavParameter,
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings
): number | undefined {
  switch (parameter) {
    case 'tpaRate':
      return pidProfile?.tpaRate
    case 'tpaBreakpoint':
      return pidProfile?.tpaBreakpoint
    case 'gyroMainLpfHz':
      return filterSettings?.gyroMainLpfHz
    case 'gyroDynLpfMinHz':
      return filterSettings?.gyroDynLpfMinHz
    case 'gyroDynLpfMaxHz':
      return filterSettings?.gyroDynLpfMaxHz
    case 'dtermLpfHz':
      return filterSettings?.dtermLpfHz
    case 'dynamicGyroNotchEnabled':
      return filterSettings?.dynamicGyroNotchEnabled
    case 'dynamicGyroNotchQ':
      return filterSettings?.dynamicGyroNotchQ
    case 'dynamicGyroNotchMinHz':
      return filterSettings?.dynamicGyroNotchMinHz
    case 'gyroAdaptiveFilterMinHz':
      return filterSettings?.gyroAdaptiveFilterMinHz
    case 'gyroAdaptiveFilterMaxHz':
      return filterSettings?.gyroAdaptiveFilterMaxHz
    case 'mcItermRelaxCutoff':
      return filterSettings?.mcItermRelaxCutoff
    default:
      return undefined
  }
}

/**
 * Clamp a resolved value to the CLI_OPTIONS range for the given parameter name.
 * Returns the clamped value, or the original if no range is defined.
 */
function clampToRange(cliName: string, value: number): number {
  const option = CLI_OPTIONS[cliName]
  if (option && option.type === 'range') {
    return Math.max(option.min, Math.min(option.max, value))
  }
  return value
}

/**
 * Returns true when a single ParameterChange resolves to the same value
 * the quad already has. Unknown current values are never treated as no-ops.
 * For per-axis params without a specific axis, returns true only if ALL 3 axes are no-ops.
 */
export function isNoOpChange(
  change: ParameterChange,
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings,
  importedValues?: Map<string, number>
): boolean {
  const { parameter, axis, recommendedChange } = change

  // Configurator-only params (e.g. feedforward) — check against PID profile
  if (parameter in CONFIGURATOR_ONLY_PARAMS) {
    const axes: Axis[] = axis ? [axis] : ['roll', 'pitch', 'yaw']
    for (const a of axes) {
      const currentValue = change.currentValue ?? getPidValue(pidProfile, parameter, a)
      if (currentValue === undefined) return false
      const [rawValue, resolved] = resolveChange(recommendedChange, currentValue, true)
      if (!resolved || rawValue === null) return false
      if (rawValue !== currentValue) return false
    }
    return true
  }

  const isPerAxisPid = parameter in PER_AXIS_PARAMS

  if (isPerAxisPid) {
    const mapping = PER_AXIS_PARAMS[parameter]
    const axes: Axis[] = axis ? [axis] : ['roll', 'pitch', 'yaw']

    for (const a of axes) {
      const cliName = `${mapping.cliPrefix}_${a}`
      const currentValue = change.currentValue
        ?? getPidValue(pidProfile, parameter, a)
        ?? importedValues?.get(cliName)

      if (currentValue === undefined) return false
      const [rawValue, resolved] = resolveChange(recommendedChange, currentValue, true)
      if (!resolved || rawValue === null) return false
      if (clampToRange(cliName, rawValue) !== currentValue) return false
    }

    return true
  }

  // Global parameter
  const cliName = GLOBAL_PARAM_MAP[parameter]
  if (!cliName) return false

  const currentValue = change.currentValue
    ?? getGlobalValue(parameter, pidProfile, filterSettings)
    ?? importedValues?.get(cliName)

  if (currentValue === undefined) return false
  const [rawValue, resolved] = resolveChange(recommendedChange, currentValue, false)
  if (!resolved || rawValue === null) return false
  return clampToRange(cliName, rawValue) === currentValue
}

/**
 * Returns true when every change in a recommendation is a no-op.
 * Recommendations with no changes are NOT considered no-ops.
 */
export function isNoOpRecommendation(
  rec: Recommendation,
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings,
  importedValues?: Map<string, number>
): boolean {
  if (rec.changes.length === 0) return false
  return rec.changes.every(change => isNoOpChange(change, pidProfile, filterSettings, importedValues))
}

/**
 * Generate a CLI set command for a single parameter change
 */
function generateSetCommand(
  change: ParameterChange,
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings,
  importedValues?: Map<string, number>
): string {
  const { parameter, axis, recommendedChange } = change

  // Configurator-only params (e.g. feedforward) can't be set via CLI
  const confOnly = CONFIGURATOR_ONLY_PARAMS[parameter]
  if (confOnly) {
    const axes: Axis[] = axis ? [axis] : ['roll', 'pitch', 'yaw']
    const lines: string[] = []
    for (const a of axes) {
      const currentValue = change.currentValue ?? getPidValue(pidProfile, parameter, a)
      const [rawValue, resolved] = resolveChange(recommendedChange, currentValue, true)
      if (resolved && rawValue !== null && (currentValue === undefined || rawValue !== currentValue)) {
        lines.push(`# ${confOnly.displayName} ${a}: change to ${rawValue} in Configurator PID tab`)
      }
    }
    return lines.join('\n')
  }

  const isPerAxisPid = parameter in PER_AXIS_PARAMS

  if (isPerAxisPid) {
    const mapping = PER_AXIS_PARAMS[parameter]
    const axes: Axis[] = axis ? [axis] : ['roll', 'pitch', 'yaw']
    const lines: string[] = []

    for (const a of axes) {
      const cliName = `${mapping.cliPrefix}_${a}`
      const currentValue = change.currentValue
        ?? getPidValue(pidProfile, parameter, a)
        ?? importedValues?.get(cliName)
      const [rawValue, resolved] = resolveChange(recommendedChange, currentValue, true)

      if (resolved && rawValue !== null) {
        const clamped = clampToRange(cliName, rawValue)
        if (currentValue !== undefined && clamped === currentValue) continue
        lines.push(`set ${cliName} = ${clamped}`)
      } else {
        lines.push(`# ${parameter}[${a}]: ${recommendedChange} (current value unknown)`)
      }
    }

    return lines.join('\n')
  }

  // Global parameter
  const cliName = GLOBAL_PARAM_MAP[parameter]
  if (!cliName) {
    return `# ${parameter}: ${recommendedChange} (unknown CLI mapping)`
  }

  const currentValue = change.currentValue
    ?? getGlobalValue(parameter, pidProfile, filterSettings)
    ?? importedValues?.get(cliName)
  const [rawValue, resolved] = resolveChange(recommendedChange, currentValue, false)

  if (resolved && rawValue !== null) {
    const clamped = clampToRange(cliName, rawValue)
    if (currentValue !== undefined && clamped === currentValue) return ''
    return `set ${cliName} = ${clamped}`
  }

  return `# ${parameter}: ${recommendedChange} (current value unknown)`
}

/**
 * Resolve all recommendation changes to a map of CLI parameter name → new value.
 * Used by "Accept Tune" to treat recommended values as the new current settings.
 */
export function resolveAllChanges(
  recommendations: Recommendation[],
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings,
  importedValues?: Map<string, number>
): Map<string, number> {
  const resolved = new Map<string, number>()

  for (const rec of recommendations) {
    for (const change of rec.changes) {
      const { parameter, axis, recommendedChange } = change

      // Skip configurator-only params (e.g. feedforward) — they don't have CLI names
      if (parameter in CONFIGURATOR_ONLY_PARAMS) continue

      const isPerAxisPid = parameter in PER_AXIS_PARAMS

      if (isPerAxisPid) {
        const mapping = PER_AXIS_PARAMS[parameter]
        const axes: Axis[] = axis ? [axis] : ['roll', 'pitch', 'yaw']
        for (const a of axes) {
          const cliName = `${mapping.cliPrefix}_${a}`
          const currentValue = change.currentValue
            ?? getPidValue(pidProfile, parameter, a)
            ?? importedValues?.get(cliName)
          const [rawValue, ok] = resolveChange(recommendedChange, currentValue, true)
          if (ok && rawValue !== null) {
            const clamped = clampToRange(cliName, rawValue)
            if (currentValue === undefined || clamped !== currentValue) {
              resolved.set(cliName, clamped)
            }
          }
        }
      } else {
        const cliName = GLOBAL_PARAM_MAP[parameter]
        if (!cliName) continue
        const currentValue = change.currentValue
          ?? getGlobalValue(parameter, pidProfile, filterSettings)
          ?? importedValues?.get(cliName)
        const [rawValue, ok] = resolveChange(recommendedChange, currentValue, false)
        if (ok && rawValue !== null) {
          const clamped = clampToRange(cliName, rawValue)
          if (currentValue === undefined || clamped !== currentValue) {
            resolved.set(cliName, clamped)
          }
        }
      }
    }
  }

  return resolved
}

/**
 * Generate INAV CLI commands from analysis recommendations
 */
export function generateCliCommands(
  recommendations: Recommendation[],
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings,
  importedValues?: Map<string, number>
): string {
  const lines: string[] = [
    '# INAV Tuning Helper - CLI Commands',
    '# Paste these commands into the INAV CLI tab',
    '',
  ]

  for (const rec of recommendations) {
    if (isNoOpRecommendation(rec, pidProfile, filterSettings, importedValues)) continue

    lines.push(`# Recommendation: ${rec.title}`)

    for (const change of rec.changes) {
      const cmd = generateSetCommand(change, pidProfile, filterSettings, importedValues)
      if (cmd) lines.push(cmd)
    }

    lines.push('')
  }

  lines.push('save')

  return lines.join('\n')
}
