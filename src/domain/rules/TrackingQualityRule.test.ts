import { describe, it, expect } from 'vitest'
import { loadTestBflLog } from '../test-helpers'
import { RuleEngine } from '../engine/RuleEngine'

describe('TrackingQualityRule', { timeout: 30000 }, () => {
  it('should not report implausible amplitude ratios (>200%) as underdamped', () => {
    const { frames, metadata } = loadTestBflLog()
    const engine = new RuleEngine()
    const result = engine.analyzeLog(frames, metadata)

    for (const issue of result.issues) {
      if (issue.type === 'underdamped') {
        const ratio = issue.metrics.amplitudeRatio ?? 0
        expect(ratio).toBeLessThanOrEqual(200)
        expect(ratio).toBeGreaterThan(105)
      }
    }
  })

  it('should detect tracking or oscillation issues in real flight data', () => {
    const { frames, metadata } = loadTestBflLog()
    const engine = new RuleEngine()
    const result = engine.analyzeLog(frames, metadata)

    const trackingIssues = result.issues.filter(issue =>
      issue.type === 'lowFrequencyOscillation' ||
      issue.type === 'underdamped' ||
      issue.type === 'overdamped'
    )

    expect(trackingIssues.length).toBeGreaterThan(0)
  })

})
