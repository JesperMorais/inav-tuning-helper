/**
 * Frame mapping - converts decoded field arrays into LogFrame/LogMetadata interfaces.
 *
 * This bridges the raw parser output to the existing domain types used by the rest of the app.
 */
import type { LogFrame, LogMetadata, PidProfile, FilterSettings } from '../types/LogFrame.ts'
import type { BblHeaders } from './types.ts'
import type { DecodedFrame } from './FrameDecoder.ts'

/**
 * Build a name→index lookup map from field definitions.
 */
function buildFieldIndex(headers: BblHeaders): Map<string, number> {
  const map = new Map<string, number>()
  for (const def of headers.iFieldDefs) {
    map.set(def.name, def.index)
  }
  return map
}

/**
 * Get a field value by name from decoded values, with a default fallback.
 */
function getField(values: number[], fieldIndex: Map<string, number>, name: string, defaultValue = 0): number {
  const idx = fieldIndex.get(name)
  if (idx === undefined) return defaultValue
  return values[idx] ?? defaultValue
}

/**
 * Convert a decoded frame to a LogFrame.
 */
export function toLogFrame(
  frame: DecodedFrame,
  fieldIndex: Map<string, number>,
  frameNumber: number,
): LogFrame {
  const v = frame.values

  const motorValues: number[] = []
  for (let i = 0; i < 8; i++) {
    const idx = fieldIndex.get(`motor[${i}]`)
    if (idx === undefined) break
    motorValues.push(v[idx] ?? 1000)
  }
  if (motorValues.length === 0) {
    motorValues.push(1000, 1000, 1000, 1000)
  }

  const throttle = getField(v, fieldIndex, 'rcCommand[3]', 1000)

  // INAV logs axisRate[0-2] for target rotation rate; BF uses setpoint[0-2]
  const setpointRoll = getField(v, fieldIndex, 'axisRate[0]') || getField(v, fieldIndex, 'setpoint[0]') || getField(v, fieldIndex, 'rcCommand[0]')
  const setpointPitch = getField(v, fieldIndex, 'axisRate[1]') || getField(v, fieldIndex, 'setpoint[1]') || getField(v, fieldIndex, 'rcCommand[1]')
  const setpointYaw = getField(v, fieldIndex, 'axisRate[2]') || getField(v, fieldIndex, 'setpoint[2]') || getField(v, fieldIndex, 'rcCommand[2]')

  // PID sum: try axisSum first, then compute from components
  const pidSumRoll = getField(v, fieldIndex, 'axisSum[0]') ||
    (getField(v, fieldIndex, 'axisP[0]') + getField(v, fieldIndex, 'axisI[0]') + getField(v, fieldIndex, 'axisD[0]'))
  const pidSumPitch = getField(v, fieldIndex, 'axisSum[1]') ||
    (getField(v, fieldIndex, 'axisP[1]') + getField(v, fieldIndex, 'axisI[1]') + getField(v, fieldIndex, 'axisD[1]'))
  const pidSumYaw = getField(v, fieldIndex, 'axisSum[2]') ||
    (getField(v, fieldIndex, 'axisP[2]') + getField(v, fieldIndex, 'axisI[2]') + getField(v, fieldIndex, 'axisD[2]'))

  // Debug values
  let debug: number[] | undefined
  const debugIdx0 = fieldIndex.get('debug[0]')
  if (debugIdx0 !== undefined) {
    debug = []
    for (let i = 0; i < 8; i++) {
      const idx = fieldIndex.get(`debug[${i}]`)
      if (idx === undefined) break
      debug.push(v[idx] ?? 0)
    }
  }

  const logFrame: LogFrame = {
    time: getField(v, fieldIndex, 'time', frameNumber * 125),
    loopIteration: getField(v, fieldIndex, 'loopIteration', frameNumber),

    gyroADC: {
      roll: getField(v, fieldIndex, 'gyroADC[0]'),
      pitch: getField(v, fieldIndex, 'gyroADC[1]'),
      yaw: getField(v, fieldIndex, 'gyroADC[2]'),
    },

    setpoint: {
      roll: setpointRoll,
      pitch: setpointPitch,
      yaw: setpointYaw,
    },

    pidP: {
      roll: getField(v, fieldIndex, 'axisP[0]'),
      pitch: getField(v, fieldIndex, 'axisP[1]'),
      yaw: getField(v, fieldIndex, 'axisP[2]'),
    },

    pidI: {
      roll: getField(v, fieldIndex, 'axisI[0]'),
      pitch: getField(v, fieldIndex, 'axisI[1]'),
      yaw: getField(v, fieldIndex, 'axisI[2]'),
    },

    pidD: {
      roll: getField(v, fieldIndex, 'axisD[0]'),
      pitch: getField(v, fieldIndex, 'axisD[1]'),
      yaw: getField(v, fieldIndex, 'axisD[2]'),
    },

    pidSum: {
      roll: pidSumRoll,
      pitch: pidSumPitch,
      yaw: pidSumYaw,
    },

    motor: motorValues,

    rcCommand: {
      roll: getField(v, fieldIndex, 'rcCommand[0]'),
      pitch: getField(v, fieldIndex, 'rcCommand[1]'),
      yaw: getField(v, fieldIndex, 'rcCommand[2]'),
      throttle,
    },

    throttle,
  }

  if (debug) {
    logFrame.debug = debug
  }

  const flightModeFlags = fieldIndex.get('flightModeFlags')
  if (flightModeFlags !== undefined) {
    logFrame.flightModeFlags = v[flightModeFlags] ?? 0
  }

  const stateFlags = fieldIndex.get('stateFlags')
  if (stateFlags !== undefined) {
    logFrame.stateFlags = v[stateFlags] ?? 0
  }

  const axisFRoll = fieldIndex.get('axisF[0]')
  if (axisFRoll !== undefined) {
    logFrame.feedforward = {
      roll: v[axisFRoll] ?? 0,
      pitch: v[fieldIndex.get('axisF[1]')!] ?? 0,
      yaw: v[fieldIndex.get('axisF[2]')!] ?? 0,
    }
  }

  return logFrame
}

/**
 * Convert BBL headers into LogMetadata.
 */
export function toLogMetadata(
  headers: BblHeaders,
  frameCount: number,
  durationSeconds: number,
): LogMetadata {
  const h = headers.headerMap

  const rawFirmwareType = h.get('Firmware type') ?? 'INAV'
  const firmwareVersion = h.get('Firmware revision') ?? h.get('Firmware version') ?? 'Unknown'
  // INAV logs "Cleanflight" as firmware type but includes "INAV" in the revision string
  const firmwareType = (rawFirmwareType === 'Cleanflight' && firmwareVersion.includes('INAV'))
    ? 'INAV'
    : rawFirmwareType
  const firmwareRevision = h.get('Firmware date') ?? undefined

  const looptime = parseInt(h.get('looptime') ?? '125') || 125
  // P interval can be "1/2" (INAV) meaning log every 2nd loop, or just "2" (BF)
  const pIntervalRaw = h.get('frameIntervalPDenom') ?? h.get('P interval') ?? '1'
  let frameIntervalPDenom = 1
  if (pIntervalRaw.includes('/')) {
    const parts = pIntervalRaw.split('/')
    frameIntervalPDenom = parseInt(parts[1]) || 1
  } else {
    frameIntervalPDenom = parseInt(pIntervalRaw) || 1
  }
  const effectiveLooptime = looptime * frameIntervalPDenom

  const fieldNames = headers.iFieldDefs.map(d => d.name)

  const motorCount = fieldNames.filter(f => f.startsWith('motor[')).length || 4
  const craftName = h.get('Craft name') ?? undefined
  const debugMode = h.get('debug_mode') ?? undefined

  const pidProfile = extractPidProfile(h)
  const filterSettings = extractFilterSettings(h)

  return {
    firmwareVersion,
    firmwareType,
    firmwareRevision,
    looptime: 1_000_000 / effectiveLooptime,
    gyroRate: 1_000_000 / looptime,
    motorCount,
    fieldNames,
    debugMode,
    craftName,
    pidProfile,
    filterSettings,
    frameCount,
    duration: durationSeconds,
  }
}

/**
 * Build the fieldIndex map (exported for use by BblParser).
 */
export { buildFieldIndex }

function extractPidProfile(h: Map<string, string>): PidProfile | undefined {
  // INAV stores PID as "rollPID", "pitchPID", "yawPID" compound headers
  // Also try individual mc_p_roll etc. from header keys
  const rollPID = h.get('rollPID')
  const pitchPID = h.get('pitchPID')
  const yawPID = h.get('yawPID')

  if (!rollPID && !pitchPID) return undefined

  const parsePID = (s: string | undefined): [number, number, number, number] => {
    if (!s) return [0, 0, 0, 0]
    const parts = s.split(',').map(v => parseInt(v.trim()) || 0)
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0]
  }

  const [rollP, rollI, rollD, rollFFFromPid] = parsePID(rollPID)
  const [pitchP, pitchI, pitchD, pitchFFFromPid] = parsePID(pitchPID)
  const [yawP, yawI, yawD, yawFFFromPid] = parsePID(yawPID)

  const tpaRate = parseInt(h.get('tpa_rate') ?? '0') || undefined
  const tpaBreakpoint = parseInt(h.get('tpa_breakpoint') ?? '0') || undefined

  // Feedforward: prefer 4th value from compound PID headers (INAV 8+), fall back to separate headers
  const ffRoll = rollFFFromPid || parseInt(h.get('feedforward_roll') ?? '0') || undefined
  const ffPitch = pitchFFFromPid || parseInt(h.get('feedforward_pitch') ?? '0') || undefined
  const ffYaw = yawFFFromPid || parseInt(h.get('feedforward_yaw') ?? '0') || undefined

  // D-boost (cross-axis D-term)
  const rollCd = parseInt(h.get('mc_cd_roll') ?? '0') || undefined
  const pitchCd = parseInt(h.get('mc_cd_pitch') ?? '0') || undefined
  const yawCd = parseInt(h.get('mc_cd_yaw') ?? '0') || undefined

  return {
    rollP, rollI, rollD,
    pitchP, pitchI, pitchD,
    yawP, yawI, yawD,
    rollFF: ffRoll,
    pitchFF: ffPitch,
    yawFF: ffYaw,
    rollCd,
    pitchCd,
    yawCd,
    tpaRate,
    tpaBreakpoint,
  }
}

function extractFilterSettings(h: Map<string, string>): FilterSettings | undefined {
  // INAV filter header keys
  const gyroMainLpfHz = parseInt(h.get('gyro_main_lpf_hz') ?? h.get('gyro_lpf_hz') ?? h.get('gyro_lpf1_static_hz') ?? h.get('gyro_lowpass_hz') ?? '0') || undefined
  const gyroMainLpfType = h.get('gyro_main_lpf_type') ?? h.get('gyro_lpf1_type') ?? undefined

  const gyroDynLpfMinHz = parseInt(h.get('gyro_dyn_lpf_min_hz') ?? '0') || undefined
  const gyroDynLpfMaxHz = parseInt(h.get('gyro_dyn_lpf_max_hz') ?? '0') || undefined

  const dtermLpfHz = parseInt(h.get('dterm_lpf_hz') ?? h.get('dterm_lpf1_static_hz') ?? h.get('dterm_lowpass_hz') ?? '0') || undefined
  const dtermLpfType = h.get('dterm_lpf_type') ?? h.get('dterm_lpf1_type') ?? undefined

  // INAV dynamic gyro notch
  const dynamicGyroNotchEnabled = parseInt(h.get('dynamic_gyro_notch_enabled') ?? '0') || undefined
  const dynamicGyroNotchQ = parseInt(h.get('dynamic_gyro_notch_q') ?? '0') || undefined
  const dynamicGyroNotchMinHz = parseInt(h.get('dynamic_gyro_notch_min_hz') ?? '0') || undefined

  // Gyro adaptive filter (INAV 9+)
  const gyroAdaptiveFilterMinHz = parseInt(h.get('gyro_adaptive_filter_min_hz') ?? '0') || undefined
  const gyroAdaptiveFilterMaxHz = parseInt(h.get('gyro_adaptive_filter_max_hz') ?? '0') || undefined

  // I-term relax
  const mcItermRelaxCutoff = parseInt(h.get('mc_iterm_relax_cutoff') ?? h.get('iterm_relax_cutoff') ?? '0') || undefined

  if (!gyroMainLpfHz && !dtermLpfHz && !dynamicGyroNotchEnabled && !mcItermRelaxCutoff) {
    return undefined
  }

  return {
    gyroMainLpfHz,
    gyroMainLpfType,
    gyroDynLpfMinHz,
    gyroDynLpfMaxHz,
    dtermLpfHz,
    dtermLpfType,
    dynamicGyroNotchEnabled,
    dynamicGyroNotchQ,
    dynamicGyroNotchMinHz,
    gyroAdaptiveFilterMinHz,
    gyroAdaptiveFilterMaxHz,
    mcItermRelaxCutoff,
  }
}
