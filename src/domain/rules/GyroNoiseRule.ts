import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { calculateRMS, analyzeFrequency } from '../utils/FrequencyAnalysis'
import { generateId } from '../utils/generateId'
import { populateCurrentValues, lookupCurrentValue } from '../utils/SettingsLookup'

/**
 * Detects excessive gyro noise floor during stable hover/cruise
 */
export const GyroNoiseRule: TuningRule = {
  id: 'gyro-noise-detection',
  name: 'Gyro Noise Floor Detection',
  description: 'Detects excessive gyro noise during stable hover',
  baseConfidence: 0.85,
  issueTypes: ['gyroNoise'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Hover/low cruise without stick input
    return (
      !window.metadata.hasStickInput &&
      window.metadata.avgThrottle >= 1200 &&
      window.metadata.avgThrottle <= 1600
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)
    const scale = profile?.thresholds.gyroNoise ?? 1.0

    // Extract gyro signal for this axis
    const gyroSignal = extractAxisData(windowFrames, 'gyroADC', window.axis)

    // Compute RMS
    const gyroRMS = calculateRMS(gyroSignal)

    // FFT → check high-band energy ratio
    const spectrum = analyzeFrequency(gyroSignal, sampleRate)
    const totalEnergy = spectrum.bandEnergy.low + spectrum.bandEnergy.mid + spectrum.bandEnergy.high
    const highBandRatio = totalEnergy > 0 ? spectrum.bandEnergy.high / totalEnergy : 0
    const midBandRatio = totalEnergy > 0 ? spectrum.bandEnergy.mid / totalEnergy : 0

    // Detected if: gyroRMS > threshold AND (high-band ratio > 0.3 OR gyroRMS > threshold) - scaled by profile
    // 5 deg/s RMS baseline - healthy quads on soft-mounted FCs show 3-5 deg/s during hover
    if (gyroRMS <= 5 * scale || (highBandRatio <= 0.3 && gyroRMS <= 10 * scale)) {
      return []
    }

    // Classify severity based on gyroRMS (scaled by profile)
    let severity: 'low' | 'medium' | 'high'
    if (gyroRMS > 15 * scale) {
      severity = 'high'
    } else if (gyroRMS > 10 * scale) {
      severity = 'medium'
    } else if (gyroRMS > 6 * scale) {
      severity = 'low'
    } else {
      return []
    }

    const confidence = Math.min(0.95, 0.6 + gyroRMS * 0.02 + highBandRatio * 0.2)

    issues.push({
      id: generateId(),
      type: 'gyroNoise',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Gyro noise: ${gyroRMS.toFixed(1)}°/s RMS, ${
        highBandRatio > 0.3
          ? `${(highBandRatio * 100).toFixed(0)}% high-freq energy`
          : midBandRatio > 0.5
            ? 'mostly mid-freq (resonance/propwash)'
            : 'mostly low-freq (frame flex)'
      }`,
      metrics: {
        noiseFloor: gyroRMS,
        dominantBand: highBandRatio > 0.5 ? 'high' : midBandRatio > 0.5 ? 'mid' : 'low',
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []
    const currentDynNotch = metadata?.filterSettings?.dynamicGyroNotchEnabled

    for (const issue of issues) {
      if (issue.type !== 'gyroNoise') continue

      const gyroRMS = issue.metrics.noiseFloor || 0

      // Whoop-specific aggressive filtering warning
      if (profile?.overrides.warnAggressiveFiltering) {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 7,
          confidence: issue.confidence * 0.85,
          title: `Caution: avoid over-filtering on ${profile.label}`,
          description: `${profile.label} quads have inherently higher gyro noise. Aggressive filtering adds latency that hurts the already-limited motor authority.`,
          rationale:
            'Small quads with low-authority motors are more sensitive to filter delay. The noise levels flagged here may be normal for this frame size. Focus on dynamic notch filtering and moderate LPF settings rather than heavy filtering.',
          risks: [
            'Under-filtering can cause hot motors',
            'Need to balance noise vs latency for the specific frame',
          ],
          changes: [],
          expectedImprovement: 'Better understanding of acceptable noise levels for this quad size',
        })
      }

      // Dynamic gyro notch recommendation (targeted noise removal)
      if (currentDynNotch === undefined || currentDynNotch === 0) {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 8,
          confidence: issue.confidence * 0.8,
          title: 'Enable dynamic gyro notch filter',
          description: 'Dynamic gyro notch is not enabled — it tracks and removes motor noise peaks',
          rationale:
            'The dynamic gyro notch filter automatically tracks and removes resonant noise frequencies. Enabling it provides targeted noise removal with less latency than broader low-pass filters.',
          risks: [
            'Adds computation overhead',
            'May need Q-factor tuning for optimal performance',
          ],
          changes: [
            {
              parameter: 'dynamicGyroNotchEnabled',
              recommendedChange: '1',
              explanation: 'Enable dynamic gyro notch for targeted motor noise removal',
            },
          ],
          expectedImprovement: 'Targeted motor noise removal, allowing less aggressive low-pass filtering',
        })
      }

      // Increase gyro filtering (gated on severity — lowpass is the bluntest tool)
      const currentGyroFilter = metadata ? lookupCurrentValue('gyroMainLpfHz', metadata) : undefined
      if (issue.severity !== 'low' && (currentGyroFilter === undefined || currentGyroFilter > 50)) {
        const lowpassChange = issue.severity === 'high' ? '-10%' : '-5%'
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 6,
          confidence: issue.confidence,
          title: 'Increase gyro filtering',
          description: 'Excessive gyro noise floor - lower the gyro LPF cutoff for stronger filtering',
          rationale:
            'Gyro noise passes through to PID calculations, causing motor noise and heat. Lowering the gyro LPF cutoff frequency blocks more noise before it affects PIDs.',
          risks: [
            'Adds phase delay, reducing responsiveness',
            'May cause "mushy" feel if overdone',
          ],
          changes: [
            {
              parameter: 'gyroMainLpfHz',
              recommendedChange: lowpassChange,
              explanation: 'Lower gyro LPF cutoff to block more high-frequency noise',
            },
          ],
          expectedImprovement: 'Cleaner gyro signal, quieter motors, reduced heat',
        })
      }

      // Adjust dynamic gyro notch
      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'adjustFiltering',
        priority: 7,
        confidence: issue.confidence * 0.9,
        title: 'Adjust dynamic gyro notch filter',
        description: 'Dynamic gyro notch can track and remove resonant noise peaks',
        rationale:
          'The dynamic gyro notch filter automatically tracks and removes motor resonance frequencies. Lowering the Q value widens the notch for broader noise removal.',
        risks: [
          'Lower Q adds more phase delay',
          'May need tuning for optimal performance',
        ],
        changes: [
          {
            parameter: 'dynamicGyroNotchEnabled',
            recommendedChange: '1',
            explanation: 'Ensure dynamic gyro notch is enabled for resonance tracking',
          },
        ],
        expectedImprovement: 'Targeted removal of resonant noise peaks',
      })

      // Extreme cases: informational about hardware vibration
      if (gyroRMS > 12) {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'hardwareCheck',
          priority: 5,
          confidence: issue.confidence * 0.7,
          category: 'hardware',
          title: 'Check for hardware vibration issues',
          description: 'Very high gyro noise may indicate mechanical vibration problems',
          rationale:
            'Extremely high gyro noise during hover often indicates hardware issues: loose FC mounting, unbalanced props, bent motor shafts, or worn bearings. Software filtering can only do so much.',
          risks: [
            'Requires physical inspection of the quad',
            'May need replacement parts',
          ],
          changes: [],
          expectedImprovement: 'Dramatically reduced noise at the source, allowing lower filter settings',
        })
      }
    }

    if (metadata) {
      return recommendations.map(r => ({ ...r, changes: populateCurrentValues(r.changes, metadata) }))
    }
    return recommendations
  },
}
