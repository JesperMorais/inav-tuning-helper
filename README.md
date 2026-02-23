<p align="center">
  <img src="public/logo.svg" width="100" alt="INAV Tuning Helper logo" />
</p>

<h1 align="center">INAV Tuning Helper</h1>

<p align="center">
  <strong>Plug in your quad via USB, download a Blackbox log, and get specific tuning recommendations — all in one place.</strong><br/>
  Built for INAV 8.x / 9.x multirotor tuning.
</p>

Client-side web app that reads Blackbox logs directly from your flight controller via USB, analyzes them, and generates actionable tuning recommendations. Read your current settings and write changes back to the FC — no Configurator needed, no copy-pasting CLI commands. You can also upload log files manually if you prefer. No backend — everything runs in your browser.

## Why This Exists

PID tuning is one of the hardest parts of FPV. Most pilots either fly stock settings or spend hours in trial-and-error, changing one slider at a time and hoping for the best.

Blackbox logs contain all the data needed to diagnose problems — oscillations, propwash, bounceback, noise — but interpreting raw gyro/motor traces is expert-level knowledge. Existing tools like Blackbox Explorer show you the data, but don't tell you _what to change_.

This app bridges that gap. Plug in via USB, and it will:

- **Download logs directly from your FC** — read blackbox data from onboard flash, no SD card removal needed
- **Detect specific issues** (propwash, bounceback, noise, tracking errors, motor saturation, etc.)
- **Recommend parameter changes** with rationale, risk assessment, and confidence scores
- **Read and write settings to your FC** — import your current values and apply tuning changes directly
- **Speak INAV** — all output uses INAV CLI parameters, ready to write directly to your FC via USB

Everything runs 100% client-side. No data leaves your browser, no account required.

## Features

**Direct FC connection** — Plug in your flight controller via USB and download blackbox logs straight from the onboard flash. The app scans the flash, finds individual logs, and lets you pick which flight to analyze. Uses the Web Serial API — no drivers or INAV Configurator needed. Once analyzed, read your current settings and write tuning changes back with a single click. (Requires Chrome/Edge.)

**Manual upload** — Prefer to work with files? Drop a `.bbl`/`.bfl` file, a `.txt` file from the SD card (INAV writes blackbox logs as `.TXT`), or a `.csv` export from Blackbox Explorer. Binary BBL parsing uses a native TypeScript parser (version-agnostic, no WASM dependency). Parsed in a Web Worker so the UI stays responsive. Handles 10MB+ logs.

**18 detection rules** — The rule engine analyzes overlapping time windows across roll, pitch, and yaw:

| Rule | Detects | Key recommendations |
| --- | --- | --- |
| **Tuning** | | |
| Bounceback | Overshoot after stick release | Adjust D gain, FF, P/D balance |
| Propwash | Oscillations during throttle drops | Increase D gain, I-term relax |
| Wobble | Mid-throttle oscillations without stick input | Frequency-dependent: P/D balance, filtering, or I-term relax |
| Tracking Quality | Setpoint-to-gyro tracking error | Adjust P, I, D per error type |
| Motor Saturation | Motors clipping at 100% | Reduce PID gains, increase TPA |
| D-term Noise | Excessive D-term activity | Increase D-term LPF, reduce D gain |
| Gyro Noise | High gyro noise floor | Gyro LPF, dynamic gyro notch |
| High-Throttle Oscillation | Oscillations at high throttle | Adjust TPA rate/breakpoint |
| Feedforward Noise | RC link noise leaking through FF | Reduce feedforward (via Configurator PID tab) |
| **Hardware** | | |
| Frame Resonance | Fixed-frequency structural vibration | Target dynamic notch, inspect frame |
| Bearing Noise | RPM-tracking spectral peaks | Inspect bearings, shafts, prop balance |
| Filter Mismatch | Filter cutoff vs. actual noise mismatch | Raise or lower filter cutoffs |
| Electrical Noise | ESC/wiring interference at idle | Check grounding, shielding, ESC noise |
| CG Offset | Diagonal motor pair imbalance | Reposition battery / redistribute weight |
| Motor Health | Single motor working significantly harder | Inspect motor, prop, bearings |
| ESC Desync | Sudden single-motor spikes | Check ESC timing, motor/ESC compatibility |
| Voltage Sag | Battery degradation across flight | Replace or upgrade battery |
| **Meta-analysis** | | |
| Temporal Pattern | Issues worsening or appearing suddenly | Thermal management or hardware inspection |

**Smart deduplication** — Issues are collapsed per type+axis (one entry regardless of how many windows detected it). Recommendations are deduplicated by parameter+axis so you never see two items for the same setting.

**Interactive chart** — Gyro, setpoint, PID terms, and motor outputs with per-axis selection, layer toggles, and zoom. Adaptively downsampled for smooth rendering.

**INAV-native output** — All recommendations use INAV CLI parameters with specific changes, rationale, risk assessment, and confidence scores.

## How to Use

1. Plug in your FC via USB and click **Download from FC** to read blackbox logs directly from the flash (or drop a `.bbl`/`.bfl`/`.txt`/`.csv` file if you prefer)
2. Pick a flight and review detected issues and recommendations (analysis runs automatically)
3. Read your current settings from the FC via USB, or paste a CLI dump manually
4. Accept the tune and write changes directly to your FC — or copy the CLI commands to apply them yourself

## Known Limitations

- Multi-log BBL files: only the first log is parsed (most common case)
- Files > 50MB may slow the browser
- Simplified FFT (sufficient for tuning, not research-grade)
- Designed for INAV 8.x / 9.x multirotors — fixed-wing tuning is not supported

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and architecture details.

## License

MIT
