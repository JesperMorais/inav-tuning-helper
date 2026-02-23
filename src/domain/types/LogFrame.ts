/**
 * Represents a single frame from an INAV blackbox log
 * All values are in native units unless specified
 */
export interface LogFrame {
  /** Frame timestamp in microseconds */
  time: number

  /** Loop iteration number */
  loopIteration: number

  // Gyro data (deg/s)
  gyroADC: AxisData

  // Setpoint (target) (deg/s)
  setpoint: AxisData

  // PID components (arbitrary units)
  pidP: AxisData
  pidI: AxisData
  pidD: AxisData
  pidSum: AxisData

  // Motor outputs (0-2000, where 1000 = min, 2000 = max)
  motor: number[]

  // RC commands (-500 to 500 for roll/pitch/yaw, 1000-2000 for throttle)
  rcCommand: RcCommand

  // Throttle (1000-2000)
  throttle: number

  // D-term setpoint (if available)
  dtermSetpoint?: AxisData

  // Feedforward output (if available)
  feedforward?: AxisData

  // Debug values (varies by debug mode)
  debug?: number[]

  // Flight mode flags
  flightModeFlags?: number

  // State flags
  stateFlags?: number
}

export interface AxisData {
  roll: number
  pitch: number
  yaw: number
}

export interface RcCommand {
  roll: number
  pitch: number
  yaw: number
  throttle: number
}

/**
 * Metadata extracted from blackbox log header
 */
export interface LogMetadata {
  /** Firmware version string */
  firmwareVersion: string

  /** Firmware type (e.g., "INAV") */
  firmwareType: string

  /** Firmware revision */
  firmwareRevision?: string

  /** PID loop frequency (Hz) */
  looptime: number

  /** Gyro update frequency (Hz) */
  gyroRate: number

  /** Number of motors */
  motorCount: number

  /** Field names present in log */
  fieldNames: string[]

  /** Debug mode active during logging */
  debugMode?: string

  /** Craft name */
  craftName?: string

  /** PID profile settings */
  pidProfile?: PidProfile

  /** Filter settings */
  filterSettings?: FilterSettings

  /** Total frames in log */
  frameCount: number

  /** Duration in seconds */
  duration: number
}

export interface PidProfile {
  // PID values (direct INAV values)
  rollP?: number
  rollI?: number
  rollD?: number
  pitchP?: number
  pitchI?: number
  pitchD?: number
  yawP?: number
  yawI?: number
  yawD?: number

  // Feedforward
  rollFF?: number
  pitchFF?: number
  yawFF?: number

  // D-boost (cross-axis D-term, INAV mc_cd_*)
  rollCd?: number
  pitchCd?: number
  yawCd?: number

  // TPA (Throttle PID Attenuation)
  tpaRate?: number
  tpaBreakpoint?: number
}

export interface FilterSettings {
  // Gyro main LPF
  gyroMainLpfHz?: number
  gyroMainLpfType?: string

  // Gyro dynamic LPF
  gyroDynLpfMinHz?: number
  gyroDynLpfMaxHz?: number

  // D-term LPF
  dtermLpfHz?: number
  dtermLpfType?: string

  // Dynamic gyro notch
  dynamicGyroNotchEnabled?: number  // 0 or 1
  dynamicGyroNotchQ?: number
  dynamicGyroNotchMinHz?: number

  // Gyro adaptive filter (INAV 9+)
  gyroAdaptiveFilterMinHz?: number
  gyroAdaptiveFilterMaxHz?: number

  // I-term relax
  mcItermRelaxCutoff?: number
}
