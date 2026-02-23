import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { detectPropwash, deriveSampleRate } from '../utils/SignalAnalysis'
import { generateId } from '../utils/generateId'
import { populateCurrentValues } from '../utils/SettingsLookup'

/**
 * Detects propwash oscillations during throttle drops
 */
export const PropwashRule: TuningRule = {
  id: 'propwash-detection',
  name: 'Propwash Detection',
  description: 'Detects oscillations caused by disturbed air during throttle drops',
  baseConfidence: 0.80,
  issueTypes: ['propwash'],
  applicableAxes: ['roll', 'pitch'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Propwash commonly occurs during turns/dives with stick input — don't exclude those
    return (
      window.metadata.avgThrottle < 1500 &&
      window.frameIndices.length > 50
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const scale = profile?.thresholds.propwashAmplitude ?? 1.0
    // Extend the frame range backward to capture the throttle drop that leads into this window
    const firstIdx = window.frameIndices[0]
    const lastIdx = window.frameIndices[window.frameIndices.length - 1]
    const lookbackCount = Math.min(firstIdx, Math.floor(window.frameIndices.length * 0.5))
    const extendedStartIdx = firstIdx - lookbackCount
    const extendedFrames = frames.slice(extendedStartIdx, lastIdx + 1)
    const sampleRate = deriveSampleRate(extendedFrames)

    const metrics = detectPropwash(extendedFrames, window.axis, sampleRate)

    if (!metrics.detected) {
      return []
    }

    // Classify severity based on amplitude and duration (scaled by profile)
    let severity: 'low' | 'medium' | 'high'
    if (metrics.amplitude > 50 * scale || metrics.duration > 120 * scale) {
      severity = 'high'
    } else if (metrics.amplitude > 30 * scale || metrics.duration > 80 * scale) {
      severity = 'medium'
    } else if (metrics.amplitude > 18 * scale) {
      severity = 'low'
    } else {
      return []
    }

    // Higher confidence for typical propwash frequency range (10-30 Hz)
    const frequencyConfidence =
      metrics.frequency > 10 && metrics.frequency < 30 ? 0.9 : 0.7

    issues.push({
      id: generateId(),
      type: 'propwash',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Propwash oscillation: ${metrics.frequency.toFixed(1)} Hz, ${metrics.amplitude.toFixed(1)}° amplitude`,
      metrics: {
        frequency: metrics.frequency,
        amplitude: metrics.amplitude,
        dtermActivity: metrics.dtermActivity,
      },
      confidence: frequencyConfidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'propwash') continue

      const amplitude = issue.metrics.amplitude || 0

      // Add iterm_relax_cutoff recommendation for profiles that prefer it
      if (profile?.overrides.propwashPreferItermRelax && profile.overrides.itermRelaxCutoff > 0) {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 8,
          confidence: issue.confidence,
          title: `Lower I-term relax cutoff on ${issue.axis}`,
          description: `For ${profile.label} quads, lowering iterm_relax_cutoff is often more effective than raising D-min for propwash`,
          rationale:
            'I-term relax controls how aggressively the I-term builds during rapid maneuvers. A lower cutoff prevents I-term windup that exacerbates propwash oscillations, which is especially effective on larger or lower-authority quads.',
          risks: [
            'May reduce tracking precision on very aggressive moves',
            'Could feel slightly less locked-in during rapid direction changes',
          ],
          changes: [
            {
              parameter: 'mcItermRelaxCutoff',
              recommendedChange: String(profile.overrides.itermRelaxCutoff),
              explanation: `Set iterm_relax_cutoff to ${profile.overrides.itermRelaxCutoff} (recommended for ${profile.label} quads)`,
            },
          ],
          expectedImprovement: 'Reduced propwash oscillations by limiting I-term windup during throttle transitions',
        })
      }

      if (amplitude > 60) {
        // Severe propwash - multiple interventions needed
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'increasePID',
          priority: 9,
          confidence: issue.confidence,
          title: `Increase D gain on ${issue.axis}`,
          description: 'Severe propwash requires stronger low-throttle damping',
          rationale:
            'D gain provides damping specifically at low throttle where propwash occurs. Higher D gain resists oscillations from disturbed air.',
          risks: [
            'May increase motor temperature',
            'Could amplify noise if gyro filtering insufficient',
          ],
          changes: [
            {
              parameter: 'pidDGain',
              recommendedChange: '+0.4',
              axis: issue.axis,
              explanation: 'Significant D gain increase for propwash resistance',
            },
          ],
          expectedImprovement: 'Reduced oscillation amplitude during throttle drops by 40-60%',
        })
      } else {
        // Moderate propwash - standard D gain increase
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'increasePID',
          priority: 6,
          confidence: issue.confidence,
          title: `Increase D gain on ${issue.axis}`,
          description: 'Moderate propwash responds well to D gain increase',
          rationale:
            'D gain specifically targets low-throttle damping without affecting high-speed flight.',
          risks: ['Slight increase in motor heat'],
          changes: [
            {
              parameter: 'pidDGain',
              recommendedChange: '+0.2',
              axis: issue.axis,
              explanation: 'Moderate D gain boost for improved propwash handling',
            },
          ],
          expectedImprovement: 'Smoother throttle drops with less visible oscillation',
        })
      }

      // For severe propwash, also recommend iterm_relax_cutoff if not already
      // covered by the profile-specific path above
      if (issue.severity === 'high' && !profile?.overrides.propwashPreferItermRelax) {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 5,
          confidence: 0.70,
          title: `Lower I-term relax cutoff on ${issue.axis}`,
          description: 'Severe propwash may be worsened by I-term windup during throttle transitions',
          rationale:
            'I-term relax controls how aggressively the I-term builds during rapid maneuvers. A lower cutoff prevents the I-term from winding up and amplifying propwash oscillations.',
          risks: [
            'May slightly reduce tracking precision on aggressive moves',
            'Could feel slightly less locked-in during rapid direction changes',
          ],
          changes: [
            {
              parameter: 'mcItermRelaxCutoff',
              recommendedChange: '10',
              explanation: 'Lower iterm_relax_cutoff to reduce I-term contribution to propwash',
            },
          ],
          expectedImprovement: 'Reduced propwash by limiting I-term windup during throttle drops',
        })
      }
    }

    if (metadata) {
      return recommendations.map(r => ({ ...r, changes: populateCurrentValues(r.changes, metadata) }))
    }
    return recommendations
  },
}
