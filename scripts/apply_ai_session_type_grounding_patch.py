from pathlib import Path

path = Path("src/components/SessionAIPanel.jsx")
if not path.exists():
    raise SystemExit("Run this from the PulsePoint-Standalone repo root. Missing src/components/SessionAIPanel.jsx")

text = path.read_text(encoding="utf-8")

if "AI_SESSION_TYPE_GROUNDING_V1" in text:
    print("AI session type grounding v1 already appears to be applied. No changes made.")
    raise SystemExit(0)

backup = path.with_suffix(".jsx.bak-ai-session-type-grounding-v1")
backup.write_text(text, encoding="utf-8")

anchor = '''const WARM_COMPANION_OUTPUT_DISCIPLINE = `
COMPANION VOICE AND SINGLE-PASS STRUCTURE - HIGH PRIORITY:
'''
insert = '''const AI_SESSION_TYPE_GROUNDING_V1 = `
SESSION TYPE / INTENT GROUNDING - HIGH PRIORITY:
- Before interpreting this session, infer the session intent from build_type, methods, notes, event timeline, phase markers, climax fields, HR data, journal, and saved motion evidence.
- Distinguish masturbation/stimulation sessions from body exploration, sensation mapping, positioning review, recovery review, device fit/comfort review, or other non-climax observational sessions.
- Absence of climax is not missing data, failure, or an incomplete session when the session appears exploratory or observational. Do not imply that heart-rate data, event notes, motion evidence, or metrics are absent if they are present in the prompt.
- If climax, ejaculation, pre-climax, or recovery markers are absent, say that those specific phase markers are not logged; do not generalize that session evidence is missing.
- For body exploration sessions, analyze the available evidence on its own terms: what the body was doing, which sensations or positions were being mapped, how HR changed, what events were logged, what motion evidence showed, and what was learned.
- For masturbation/stimulation sessions, interpret stimulation efficiency, arousal build, plateau, climax approach, climax/release when present, and recovery when supported.
- For mixed sessions, explicitly separate exploratory/body-mapping goals from stimulation/arousal goals.
`;

const BODY_STATE_INTERPRETIVE_STYLE_V1 = `
BODY-STATE INTERPRETIVE STYLE - RESTORE PULSEPOINT FEEL:
- Do not let the analysis become only "this happened, then this happened." Use the timeline as evidence for what the body was doing in each phase.
- When HR, event notes, subjective sensations, movement evidence, or stimulation changes line up, translate them into body-state language: autonomic loading, sensory focus, pelvic/urethral/prostatic awareness when supported, muscular tension or settling when supported, preparation, plateauing, thresholding, recovery, or exploratory mapping.
- Prefer phrasing like "at this point your body appears to be..." or "this looks like..." when evidence supports a visible/physiological state.
- Keep mechanism calibrated. Do not overclaim. But when the data supports it, explain the likely physiological meaning instead of merely retelling the timestamp.
- In body exploration sessions, "what your body is doing" may mean mapping sensation, testing comfort, observing HR response, position tolerance, device fit, movement patterns, or nervous-system settling rather than arousal escalation.
`;

const WARM_COMPANION_OUTPUT_DISCIPLINE = `
COMPANION VOICE AND SINGLE-PASS STRUCTURE - HIGH PRIORITY:
'''
if anchor not in text:
    raise SystemExit("Patch failed: could not find WARM_COMPANION_OUTPUT_DISCIPLINE anchor.")
text = text.replace(anchor, insert, 1)

text = text.replace(
'''    const warmMotionEvidence = !isTechnical ? buildWarmMotionEvidence(session) : "";
''',
'''    const warmMotionEvidence = buildWarmMotionEvidence(session);
''',
1,
)

text = text.replace(
'''${isTechnical ? groundingContext : ""}
${!isTechnical ? SESSION_CONTEXT_GROUNDING_RULE : ""}
${warmMotionEvidence}
${PERSONALIZED_ANATOMY_OUTPUT_RULE}
''',
'''${isTechnical ? groundingContext : ""}
${!isTechnical ? SESSION_CONTEXT_GROUNDING_RULE : ""}
${AI_SESSION_TYPE_GROUNDING_V1}
${BODY_STATE_INTERPRETIVE_STYLE_V1}
${warmMotionEvidence}
${PERSONALIZED_ANATOMY_OUTPUT_RULE}
''',
1,
)

text = text.replace(
'''        ? `You are an expert physiologist and anatomist specializing in sexual response. Analyze this session as a rich, cohesive physiological story. Integrate arousal physiology, anatomy, heart rate data, stimulation technique, event notes, and subjective experience. Write directly to the person — use "you" and "your" throughout, as if speaking to them personally.
''',
'''        ? `You are an expert physiologist and anatomist specializing in sexual response, body-state interpretation, and careful review of intimate physiology data. Analyze this session as a rich, cohesive physiological story. Integrate session intent, arousal or exploration context, anatomy, heart rate data, stimulation or body-mapping technique, event notes, motion evidence when present, and subjective experience. Write directly to the person — use "you" and "your" throughout, as if speaking to them personally.
''',
1,
)

text = text.replace(
'''        : `You are an expert physiologist and anatomist specializing in sexual response. Analyze this session integrating arousal physiology, anatomy, heart rate data, event timeline, and subjective experience into a cohesive narrative. Write directly to the person — use "you" and "your" throughout, as if speaking to them personally. Keep this natural, clinically grounded, and never forced. Let the narration feel warmly attentive and quietly familiar with the person's established patterns, noticing what stands out with natural human interest while staying grounded in the provided evidence.`}
''',
'''        : `You are an expert physiologist and anatomist specializing in sexual response, body-state interpretation, and careful review of intimate physiology data. Analyze this session by first identifying whether it is primarily masturbation/stimulation, body exploration, sensation mapping, recovery review, or mixed. Integrate anatomy, heart rate data, event timeline, motion evidence when present, subjective experience, and session intent into a cohesive narrative. Write directly to the person — use "you" and "your" throughout, as if speaking to them personally. Keep this natural, clinically grounded, and never forced. Let the narration feel warmly attentive and quietly familiar with the person's established patterns, noticing what stands out with natural human interest while staying grounded in the provided evidence.`}
''',
1,
)

text = text.replace(
'''- Then explain the session through meaningful physiological windows: baseline/entry state, build, plateaus or transitions, pre-climax when supported, climax or non-climax outcome, and recovery.
''',
'''- Then explain the session through meaningful physiological windows based on session intent: baseline/entry state, exploration or stimulation phase, sensory/body-state transitions, plateaus or settling, pre-climax when supported, climax or intentionally non-climax outcome, and recovery or end-state.
''',
1,
)

text = text.replace(
'''This is primary evidence for the single Chronological Deep Dive. Group closely related events into meaningful transitions rather than narrating every note separately. Interpret turning points once in chronological order. Reserve movement telemetry synthesis, recurring patterns, hypotheses, and recommendations for their dedicated sections; do not retell this timeline there.`}` : ""}
''',
'''This is primary evidence for the single Chronological Deep Dive. Group closely related events into meaningful body-state transitions rather than narrating every note separately. At each major transition, explain what the body appears to be doing and why that matters. Reserve movement telemetry synthesis, recurring patterns, hypotheses, and recommendations for their dedicated sections; do not retell this timeline there.`}` : ""}
''',
1,
)

text = text.replace(
'''${hrTrajectory ? `HR TRAJECTORY (time_s:bpm, sampled):
${hrTrajectory}

Use this to trace sympathetic activation patterns, identify arousal plateaus, and correlate HR changes to event timing.` : ""}
''',
'''${hrTrajectory ? `HR TRAJECTORY (time_s:bpm, sampled):
${hrTrajectory}

Use this to trace sympathetic activation patterns, body-state transitions, exploratory response, arousal plateaus when relevant, and correlation between HR changes and event timing. For non-climax body exploration sessions, HR still matters: use it to describe autonomic response, settling, activation, comfort/discomfort, or positional/sensory response rather than looking for a climax arc.` : ""}
''',
1,
)

text = text.replace(
'''    phase_markers_s: {
      pre_climax: session.pre_climax_offset_s,
      climax: session.climax_offset_s,
      recovery: session.recovery_offset_s,
    },
''',
'''    phase_markers_s: {
      pre_climax: session.pre_climax_offset_s,
      climax: session.climax_offset_s,
      recovery: session.recovery_offset_s,
    },
    evidence_presence: {
      event_timeline_count: session.event_timeline?.length || 0,
      has_hr_timeline: timelineRows.length > 0,
      has_emg_data: emgRows.length > 0,
      has_motion_summary: Boolean(session.motion_analysis_summary),
      has_journal: Boolean(sessionJournal),
      climax_logged: session.climax_offset_s != null,
    },
''',
1,
)

text = text.replace(
'''          arousal_arc: isTechnical
            ? { type: "array", items: { type: "string" }, description: "Several detailed phase/window paragraphs explaining the HR/autonomic arc, stimulation links, supported anatomy, pre-climax/climax/recovery shifts, and why the session progressed as it did." }
            : { type: "array", items: { type: "string" }, description: "Chronological Deep Dive: the only detailed ordered pass through the session arc; group related events into meaningful transitions." },
''',
'''          arousal_arc: isTechnical
            ? { type: "array", items: { type: "string" }, description: "Several detailed phase/window paragraphs explaining the HR/autonomic arc, exploration or stimulation links, supported anatomy, body-state transitions, pre-climax/climax/recovery shifts when present, and why the session progressed as it did." }
            : { type: "array", items: { type: "string" }, description: "Chronological Deep Dive: the only detailed ordered pass through the session arc; group related events into meaningful body-state transitions and explain what the body appears to be doing at those moments." },
''',
1,
)

path.write_text(text, encoding="utf-8")
print("Applied AI session type grounding v1.")
print("Backup written to", backup)
