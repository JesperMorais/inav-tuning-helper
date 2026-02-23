import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { calculateRMS, analyzeFrequency } from '../utils/FrequencyAnalysis'
import { generateId } from '../utils/generateId'
import { populateCurrentValues } from '../utils/SettingsLookup'

/**
 * Detects noisy feedforward during steady sticks (no active input).
 * Well-tuned FF should be near zero during calm flight; elevated RMS indicates
 * RC link noise leaking through the feedforward path.
 */
export const FeedforwardNoiseRule: TuningRule = {
  id: 'feedforward-noise-detection',
  name: 'Feedforward Noise Detection',
  description: 'Detects noisy feedforward signal during steady sticks',
  baseConfidence: 0.85,
  issueTypes: ['feedforwardNoise'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (window: AnalysisWindow, frames: LogFrame[]): boolean => {
    // Calm flight with no stick input and FF data present
    if (window.metadata.hasStickInput) return false
    if (window.metadata.avgThrottle < 1100) return false

    // Check that at least some frames have feedforward data
    return window.frameIndices.some(i => frames[i]?.feedforward !== undefined)
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)
    const scale = profile?.thresholds.dtermNoise ?? 1.0 // Reuse noise threshold scaling

    const ffSignal = extractAxisData(windowFrames, 'feedforward', window.axis)
    const ffRMS = calculateRMS(ffSignal)

    // During steady sticks, well-tuned FF should be <2 deg/s RMS
    // Detection threshold: 5 deg/s
    if (ffRMS < 5 * scale) {
      return []
    }

    // FFT for frequency analysis to confirm it's noise (not a delayed stick response)
    const spectrum = analyzeFrequency(ffSignal, sampleRate)
    const totalEnergy = spectrum.bandEnergy.low + spectrum.bandEnergy.mid + spectrum.bandEnergy.high
    const highBandRatio = totalEnergy > 0 ? spectrum.bandEnergy.high / totalEnergy : 0

    // Classify severity
    let severity: 'low' | 'medium' | 'high'
    if (ffRMS > 20 * scale) {
      severity = 'high'
    } else if (ffRMS > 12 * scale) {
      severity = 'medium'
    } else {
      severity = 'low'
    }

    const confidence = Math.min(0.95, 0.6 + ffRMS * 0.015 + highBandRatio * 0.15)

    issues.push({
      id: generateId(),
      type: 'feedforwardNoise',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `FF noise: ${ffRMS.toFixed(1)}°/s RMS during steady sticks`,
      metrics: {
        feedforwardRMS: ffRMS,
        noiseFloor: ffRMS,
        dominantBand: highBandRatio > 0.5 ? 'high' : ffRMS > 10 ? 'mid' : 'low',
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], _profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'feedforwardNoise') continue

      const ffRMS = issue.metrics.feedforwardRMS || 0
      const ffReduction = issue.severity === 'high' ? '-15%' : issue.severity === 'medium' ? '-10%' : '-5%'

      // Primary: reduce feedforward gain to lower noise
      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'adjustFeedforward',
        priority: 8,
        confidence: issue.confidence,
        title: `Reduce Feedforward on ${issue.axis}`,
        description: 'RC link noise is leaking through feedforward — reduce feedforward gain',
        rationale:
          `Feedforward shows ${ffRMS.toFixed(1)}°/s RMS during steady sticks (should be <2). Reducing the feedforward gain lowers the noise amplitude at the cost of slightly less proactive stick tracking.`,
        risks: [
          'Reduced feedforward may increase tracking lag during active flying',
          'May feel less responsive on initial stick inputs',
        ],
        changes: [
          {
            parameter: 'pidFeedforward',
            recommendedChange: ffReduction,
            axis: issue.axis,
            explanation: `Reduce feedforward gain to suppress RC noise (${ffRMS.toFixed(1)}°/s RMS during steady sticks)`,
          },
        ],
        expectedImprovement: 'Cleaner feedforward signal, quieter motors during calm flight',
      })
    }

    if (metadata) {
      return recommendations.map(r => ({ ...r, changes: populateCurrentValues(r.changes, metadata) }))
    }
    return recommendations
  },
}
