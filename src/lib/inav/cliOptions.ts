/**
 * INAV CLI option definitions.
 * Source: INAV 9.x CLI.
 *
 * Only includes parameters that the tuning helper reads or writes.
 * Helper legend:  _e = enum,  _r = range
 * Scope shortcuts: P = profile (PID)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CliOptionScope = 'global' | 'profile' | 'rateprofile'

export interface EnumCliOption {
  type: 'enum'
  values: string[]
  default?: string
  scope: CliOptionScope
}

export interface RangeCliOption {
  type: 'range'
  min: number
  max: number
  default?: number
  scope: CliOptionScope
}

export interface ArrayCliOption {
  type: 'array'
  length: number
  default?: string
  scope: CliOptionScope
}

export interface StringCliOption {
  type: 'string'
  minLength: number
  maxLength: number
  default?: string
  scope: CliOptionScope
}

export type CliOption = EnumCliOption | RangeCliOption | ArrayCliOption | StringCliOption

// ---------------------------------------------------------------------------
// Compact constructors (file-private)
// ---------------------------------------------------------------------------

const P: CliOptionScope = 'profile'

const _e = (values: string[], def?: string, scope: CliOptionScope = 'global'): EnumCliOption => ({
  type: 'enum', values, scope, ...(def != null && { default: def }),
})
const _r = (min: number, max: number, def?: number, scope: CliOptionScope = 'global'): RangeCliOption => ({
  type: 'range', min, max, scope, ...(def != null && { default: def }),
})

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const CLI_OPTIONS: Record<string, CliOption> = {

  // --- PID gains (multirotor) ---
  mc_p_roll: _r(0, 200, 40, P),
  mc_i_roll: _r(0, 200, 30, P),
  mc_d_roll: _r(0, 200, 23, P),
  mc_p_pitch: _r(0, 200, 40, P),
  mc_i_pitch: _r(0, 200, 30, P),
  mc_d_pitch: _r(0, 200, 23, P),
  mc_p_yaw: _r(0, 200, 85, P),
  mc_i_yaw: _r(0, 200, 45, P),
  mc_d_yaw: _r(0, 200, 0, P),

  // --- D-boost (cross-axis D-term) ---
  mc_cd_roll: _r(0, 200, 60, P),
  mc_cd_pitch: _r(0, 200, 60, P),
  mc_cd_yaw: _r(0, 200, 60, P),

  // --- TPA ---
  tpa_rate: _r(0, 100, 0, P),
  tpa_breakpoint: _r(1000, 2000, 1500, P),

  // --- I-term relax ---
  mc_iterm_relax: _e(['OFF', 'RP', 'RPY'], 'RP', P),
  mc_iterm_relax_cutoff: _r(1, 100, 15, P),

  // --- Gyro filters ---
  gyro_main_lpf_hz: _r(0, 500, 110),
  gyro_main_lpf_type: _e(['PT1', 'BIQUAD'], 'PT1'),
  gyro_dyn_lpf_min_hz: _r(0, 500, 0),
  gyro_dyn_lpf_max_hz: _r(0, 500, 0),
  gyro_dyn_lpf_curve_expo: _r(0, 10, 5),

  // --- Dynamic gyro notch ---
  dynamic_gyro_notch_enabled: _e(['OFF', 'ON'], 'ON'),
  dynamic_gyro_notch_q: _r(1, 1000, 250),
  dynamic_gyro_notch_min_hz: _r(30, 1000, 80),
  dynamic_gyro_notch_count: _r(1, 5, 3),
  dynamic_gyro_notch_mode: _e(['3D', '2D'], '3D'),

  // --- Gyro adaptive filter (INAV 9+) ---
  gyro_adaptive_filter_min_hz: _r(0, 1000, 0),
  gyro_adaptive_filter_max_hz: _r(0, 1000, 0),

  // --- D-term filter ---
  dterm_lpf_hz: _r(0, 500, 110, P),
  dterm_lpf_type: _e(['PT1', 'BIQUAD', 'PT2', 'PT3'], 'PT1', P),
  dterm_lpf2_hz: _r(0, 500, 0, P),
  dterm_lpf2_type: _e(['PT1', 'BIQUAD', 'PT2', 'PT3'], 'PT1', P),
}
