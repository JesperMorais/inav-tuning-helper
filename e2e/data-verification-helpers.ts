import { Page } from '@playwright/test'

/**
 * Known valid INAV CLI parameter names that our CLI export can produce.
 * Derived from CliExport.ts PER_AXIS_PARAMS and GLOBAL_PARAM_MAP.
 */
export const VALID_CLI_PARAMS = new Set([
  // Per-axis PID (mc_p/mc_i/mc_d/mc_cd/mc_ff × roll/pitch/yaw)
  'mc_p_roll', 'mc_p_pitch', 'mc_p_yaw',
  'mc_i_roll', 'mc_i_pitch', 'mc_i_yaw',
  'mc_d_roll', 'mc_d_pitch', 'mc_d_yaw',
  'mc_cd_roll', 'mc_cd_pitch', 'mc_cd_yaw',
  // Global
  'gyro_main_lpf_hz',
  'gyro_dyn_lpf_min_hz', 'gyro_dyn_lpf_max_hz',
  'dterm_lpf_hz',
  'dynamic_gyro_notch_enabled', 'dynamic_gyro_notch_q', 'dynamic_gyro_notch_min_hz',
  'gyro_adaptive_filter_min_hz', 'gyro_adaptive_filter_max_hz',
  'tpa_rate', 'tpa_breakpoint',
  'mc_iterm_relax_cutoff',
])

/**
 * Chart labels use shortLabel() which extracts the text before the colon in
 * issue descriptions. These are the known prefixes produced by each rule.
 */
export const VALID_CHART_LABELS = new Set([
  // BouncebackRule
  'Bounceback detected',
  // PropwashRule
  'Propwash oscillation',
  // WobbleRule (description starts with frequency band)
  'Low-frequency wobble', 'Mid-frequency wobble', 'High-frequency wobble',
  // GyroNoiseRule
  'Gyro noise',
  // DTermNoiseRule
  'D-term noise',
  // FeedforwardNoiseRule
  'FF noise',
  // MotorSaturationRule
  'Motor saturation', 'CG offset',
  // HighThrottleOscillationRule
  'High-throttle oscillation',
  // TrackingQualityRule
  'Phase lag', 'Poor tracking', 'Over-filtering',
  // ElectricalNoiseRule
  'Electrical noise at idle',
  // CgOffsetRule (dedicated)
  // 'CG offset' — already added above via MotorSaturationRule
  // MotorHealthRule
  'Motor imbalance',
  // BearingNoiseRule
  'Bearing noise',
  // FrameResonanceRule
  'Frame resonance',
  // EscDesyncRule
  'ESC desync',
  // VoltageSagRule
  'Voltage sag',
  // FilterNoiseComparisonRule
  'Gyro over-filtering', 'Gyro under-filtering',
  'D-term over-filtering', 'D-term under-filtering',
])

/** Extract the text of a <p> containing a given label from an issue card */
async function metricText(card: ReturnType<Page['locator']>, label: string): Promise<string | null> {
  const el = card.locator('p').filter({ hasText: label })
  if (await el.count() === 0) return null
  return (await el.first().textContent())!.trim()
}

/** Extract structured issue data from all issue cards on the page */
export async function extractIssues(page: Page) {
  // Issues are on the Issues tab (default tab is Summary)
  await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
  const cards = page.locator('[data-issue-id]')
  const count = await cards.count()
  const issues: {
    severity: string
    axis: string
    confidence: number
    description: string
    frequency?: number
    amplitude?: number
    overshoot?: number
  }[] = []

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    const badge = card.locator('span').filter({ hasText: /^(HIGH|MEDIUM|LOW)$/ })
    const severity = (await badge.textContent())!.trim()

    // Use <p> parent to get full text like "Axis: roll"
    const axisText = await metricText(card, 'Axis:')
    const axis = axisText!.replace(/.*Axis:\s*/, '').trim()

    const confText = await metricText(card, 'Confidence:')
    const confidence = parseFloat(confText!.replace(/.*Confidence:\s*/, '').replace('%', '').trim())

    const description = (await card.locator('h4').first().textContent())!.trim()

    const issue: typeof issues[0] = { severity, axis, confidence, description }

    // Extract optional metrics from parent <p> elements
    const freqText = await metricText(card, 'Frequency:')
    if (freqText) {
      issue.frequency = parseFloat(freqText.replace(/.*Frequency:\s*/, '').replace('Hz', '').trim())
    }
    const ampText = await metricText(card, 'Amplitude:')
    if (ampText) {
      issue.amplitude = parseFloat(ampText.replace(/.*Amplitude:\s*/, '').replace('°/s', '').trim())
    }
    const ovText = await metricText(card, 'Overshoot:')
    if (ovText) {
      issue.overshoot = parseFloat(ovText.replace(/.*Overshoot:\s*/, '').replace('°', '').trim())
    }

    issues.push(issue)
  }
  return issues
}
