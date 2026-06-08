import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSarahSessionSynthesisPrompt,
  buildSessionAnalysisEvidencePacket,
  normalizeGoldStandardSessionAnalysis,
  requiredAnalysisSectionsPresent,
} from '../../src/lib/sessionEvidencePacket.js';

const session = {
  id: 's1',
  date: '2026-06-07',
  duration_minutes: 15,
  intensity: 9,
  satisfaction: 8,
  build_quality: 7,
  build_type: 'plateau-heavy',
  methods: ['manual', 'silicone sleeve'],
  climax_offset_s: 624,
  hr_at_climax: 118,
  session_context: {
    fatigue: 'tired',
    hydration_state: 'electrolyte_supported',
    food_state: 'normal_meal',
    alcohol: { used: true, qualitative_level: 'moderate', timing_relative_to_session: 'under_30_min' },
    cannabis: { used: true, route: 'smoked', qualitative_level: 'moderate', timing_relative_to_session: 'under_30_min' },
    mental_state: ['calm', 'meditative'],
    privacy_interruptibility: 'fully_private',
    environmental_preparation: ['tools_prepared', 'telemetry_active'],
  },
  event_timeline: [
    { time_s: 41, note: 'Right hand makes first visible contact with shaft and scrotal-base region.', category: ['stimulation'], source: 'ai_video_pass' },
    { time_s: 432, note: 'Sleeve lifted and lubricant handled during a stimulation break.', category: ['stimulation_paused'], source: 'ai_video_pass' },
    { time_s: 624, note: 'Confirmed climax marker with visible whitish ejaculate.', category: ['physical'], source: 'ai_video_pass' },
  ],
  ai_analysis: {
    _video_pass_findings: [{
      id: 'vp1',
      label: 'AI video pass 7:12-7:36',
      clip: { start_s: 432, end_s: 456 },
      source_video: { label: 'Main' },
      summary: 'Sleeve stroking pauses as lubricant is handled, then resumes.',
      findings: [{ title: 'Lubrication break', text: 'Sleeve is lifted clear and lubricant bottle is handled.', confidence: 'high' }],
      draft_events: [{ time_s: 432, note: 'Sleeve lifted for lubrication break.', confidence: 'high' }],
      telemetry: 'HR avg 99 BPM.',
    }],
  },
};

const timelineRows = [
  { time_offset_s: 0, hr: 95, hrv_rmssd_ms: 6, hrv_sdnn_ms: 12, hrv_quality: 'moderate' },
  { time_offset_s: 300, hr: 103, hrv_rmssd_ms: 77, hrv_sdnn_ms: 65, hrv_quality: 'moderate' },
  { time_offset_s: 624, hr: 118, hrv_rmssd_ms: 59, hrv_sdnn_ms: 44, hrv_quality: 'high' },
];

test('shared evidence packet preserves context, video cards, HRV, and missing EMG', () => {
  const packet = buildSessionAnalysisEvidencePacket({ session, timelineRows, emgRows: [], userProfile: { arousal_notes: 'Left foot reacts first.' } });
  assert.equal(packet.user_logged_context.present, true);
  assert.match(packet.user_logged_context.text, /Alcohol: logged use/i);
  assert.match(packet.user_logged_context.text, /Cannabis: logged use/i);
  assert.equal(packet.visual_evidence.saved_sarah_video_cards_count, 1);
  assert.equal(packet.telemetry_findings.heart_rate.present, true);
  assert.equal(packet.hrv_findings.source, 'RR-interval-derived rolling HRV');
  assert.equal(packet.emg_findings.present, false);
  assert.match(packet.emg_findings.missing_statement, /No EMG data/i);
  assert.equal(packet.readiness, 'ready_for_full_sarah_synthesis');
});

test('local synthesis prompt forbids invented visual findings and includes the shared packet', () => {
  const packet = buildSessionAnalysisEvidencePacket({ session, timelineRows, emgRows: [] });
  const prompt = buildSarahSessionSynthesisPrompt({ packet, local: true });
  assert.match(prompt, /You are not a visual model/i);
  assert.match(prompt, /Do not invent new visual findings/i);
  assert.match(prompt, /Shared evidence packet/i);
  assert.match(prompt, /plateau-heavy/i);
});

test('gold-standard normalization supplies every required section and missing EMG statement', () => {
  const packet = buildSessionAnalysisEvidencePacket({ session, timelineRows, emgRows: [] });
  const normalized = normalizeGoldStandardSessionAnalysis({
    executive_summary: 'This is a structured session read.',
    chronological_deep_dive: [{ time_range: '0:00-1:00', paragraph: 'Baseline and first contact are reviewed.', evidence_refs: ['event-0'], claim_types: ['visual_evidence'] }],
    motion_evidence_interpretation: [{ paragraph: 'Motion evidence is limited to saved visual cards.', evidence_refs: ['visual_evidence'], claim_types: ['visual_evidence'] }],
    telemetry_interpretation: [{ paragraph: 'Heart rate and HRV are interpreted cautiously.', evidence_refs: ['hrv_findings'], claim_types: ['hrv_interpretation'] }],
    patterns_hypotheses: [{ paragraph: 'Hypothesis: plateau-heavy rhythm may explain oscillation.', evidence_refs: ['session_metadata'], claim_types: ['hypothesis'] }],
    recommendations_experiments: [{ paragraph: 'Track the sleeve-to-manual transition next time.', evidence_refs: ['visual_evidence'], claim_types: ['hypothesis'] }],
    limitations: [{ paragraph: 'Middle video coverage is incomplete.', evidence_refs: [], claim_types: ['limitation'] }],
    provenance_summary: [{ paragraph: 'Evidence came from the shared packet.', evidence_refs: ['session_evidence_packet'], claim_types: ['limitation'] }],
  }, packet);
  const present = requiredAnalysisSectionsPresent(normalized);
  for (const [key, ok] of Object.entries(present)) {
    assert.equal(ok, true, `${key} should be present`);
  }
  assert.match(normalized.emg_analysis[0].paragraph, /No EMG data/i);
});
