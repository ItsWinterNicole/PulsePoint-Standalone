# PulsePoint Standalone — Codex Handoff

## Project Identity

PulsePoint Standalone is a serious local-first physiological session analysis app migrated from Base44.

It is not a toy demo. Preserve working behavior.

The app combines:
- Express backend
- SQLite local database
- Base44 compatibility shim
- backend AI orchestration
- OpenAI + Claude integrations
- premium TTS
- HR + EMG telemetry
- live capture
- OBS automation
- SSE updates
- wake word annotations
- media player + telemetry cockpit
- AI session analysis
- longitudinal profile/session awareness

## Core Rule

Do not perform reckless refactors.

Before making meaningful changes:
1. Inspect current implementation.
2. Understand existing behavior.
3. Preserve working flows.
4. Make the smallest safe change.
5. Explain what changed and why.

Prefer targeted patches over broad rewrites.

## Sacred Systems

### Premium TTS

TTS is extremely sensitive and must be handled with care.

The voice personality, cadence, pacing, pronunciation, emotional tone, and natural delivery are critical product features.

Do not “optimize” TTS in ways that reduce quality.

Avoid:
- aggressive chunking changes
- wording normalization that changes cadence
- forced emphasis
- weird capitalization artifacts
- robotic clinical tone
- regressions like “YOUR PENIS” style emphasis

Preserve:
- warm trusted companion tone
- smooth natural cadence
- correct anatomical pronunciation
- emotionally intelligent delivery
- high-quality audio settings
- retry/fallback behavior that does not corrupt tone

If modifying TTS, isolate changes and test carefully.

### AI Analysis

PulsePoint supports two desired analysis modes:

1. Warm trusted companion analysis  
   - emotionally resonant
   - personalized
   - familiar
   - meaningful
   - psychologically insightful

2. Technical deep-dive analysis  
   - more structured
   - evidence-aware
   - physiology-focused
   - careful about mechanism and causality

Both modes should preserve the user’s historical profile awareness.

Do not flatten the warm mode into sterile medical documentation.

## AI Profiler Guidance

The profiler should separate:

- direct telemetry
- repeated session observations
- user journal notes
- AI interview memories
- user hypotheses
- experimental plans
- AI interpretations

Important distinction:

Observed pattern is not the same as mechanism.

Good:
- “Your body repeatedly builds in waves.”
- “This appears across many sessions.”
- “Your left foot consistently reacts earlier and more strongly than the right.”
- “This may be a useful motor marker.”

Bad:
- “Your orgasmic threshold is cardiovascularly gated.”
- “This proves parasympathetic braking.”
- “This indicates low prolactin.”
- “This reflects hemispheric dominance.”

Strong narrative language is allowed when supported by repeated evidence.

Do not invent endocrine, neurological, cardiovascular, or anatomical mechanisms unless directly supported or explicitly framed as speculative.

## Source Confidence Model

Use this hierarchy when interpreting session/profile data:

### Tier 1 — High Confidence
Objective telemetry:
- HR
- EMG
- timestamps
- session duration
- event timing
- recovery slopes
- captured media-derived markers

### Tier 2 — Moderate Confidence
Repeated subjective/user observations:
- consistent motor patterns
- repeated body cues
- repeated environmental effects
- repeated stimulation outcomes

### Tier 3 — Low Confidence
User hypotheses:
- anatomical causal theories
- inferred mechanisms
- suspected explanations

Label these as user hypotheses, not facts.

### Tier 4 — Experimental Intent
Future plans:
- “try X next”
- “combine Y and Z”
- “maybe this will...”

Do not treat future plans as evidence.

## Known Physiological/Profile Context

Current context includes:
- idiopathic elevated resting heart rate since adolescence
- no known arrhythmia
- normal cardiac function
- normal thyroid panels
- stress/nicotine may contribute but do not fully explain HR history
- HR interpretation should consider elevated baseline
- alcohol, THC, nicotine, fatigue, hydration, stress, and timing are confounders

Arousal pattern context:
- sessions occur on exam table/semi-Fowler/supine/lithotomy setups
- space and table are functional for observation and repeatability, not automatically “ritual fetish” framing
- monitoring and self-observation can themselves amplify arousal
- repeated near-climax events are not intentional edging
- user’s goal is generally to reach climax efficiently
- finger-on-glans/mid-shaft-to-glans stimulation is usually used to rebuild erection quality and recover from overstimulation/near-climax destabilization
- left foot consistently reacts faster/stronger than right and is a legitimate observed motor marker
- avoid speculative explanations for the left/right asymmetry unless framed as hypothesis

## Current Working Model

The current best interpretation is:

The user’s sessions often show stepwise buildup with near-climax destabilization events.

Possible model:
- arousal ramps quickly
- stimulation or body tension may become slightly overstimulating
- near apex, erection quality may reduce slightly
- lighter focused stimulation helps rebuild erection and breathing stability
- final successful climb is often cleaner and followed by rapid recovery

Avoid claiming this is definitively cardiovascularly gated.

Better phrasing:
“The data may support a threshold destabilization pattern where rapid escalation sometimes exceeds the body’s most stable arousal zone before a later, cleaner terminal climb.”

## Architecture Priorities

Preserve:
- existing Express backend behavior
- SQLite persistence
- Base44 compatibility shim unless explicitly removing it
- backend orchestration
- provider integrations
- TTS quality
- SSE behavior
- telemetry import/capture
- OBS automation
- session/profile analysis
- wake word annotations
- media cockpit

## Development Rules

Before editing:
- inspect related files
- understand data flow
- identify tests or manual checks
- make a branch if possible
- keep diffs small

After editing:
- summarize changed files
- explain behavioral impact
- mention risks
- suggest verification steps
- do not claim untested behavior is verified

## Preferred Patch Style

Use small focused commits.

Avoid:
- broad formatting-only diffs
- renaming files unnecessarily
- changing public data shapes without migration
- replacing working systems wholesale
- silently changing prompts
- silently changing TTS behavior

## Environment / Secrets

Expected env concepts may include:
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- optional OPENAI_ADMIN_API_KEY for usage/cost reporting
- optional ANTHROPIC_ADMIN_API_KEY for admin/cost reporting

Normal API keys power analysis/TTS.

Admin keys are optional for provider-side cost reporting only.

Do not log secrets.

Do not expose secrets in frontend bundles.

## Cost Reporting

Provider admin cost reporting is optional.

Internal per-call usage tracking may be more useful than provider dashboards because PulsePoint can attribute cost to:
- session analysis
- profile generation
- TTS jobs
- chunk retries
- model/provider selection

If modifying cost tracking, preserve inference behavior even when admin reporting keys are missing.

## UX Tone

This app should feel:
- capable
- calm
- personal
- technically serious
- not sterile
- not corporate
- not cringe

Avoid UI copy that sounds alarming unless there is real danger.

Example:
Better:
“Optional usage reporting credentials”
Worse:
“Admin key required”

## Current Non-Negotiables

- Commit/branch before risky changes.
- Preserve masterpieces.
- Do not break Nova/TTS.
- Do not reckless-refactor.
- Treat prompts as product logic.
- Treat analysis tone as part of UX.
- Evidence first, but personality stays alive.