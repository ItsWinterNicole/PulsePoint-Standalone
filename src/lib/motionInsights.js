const DEFAULT_CLIMAX_WINDOW_SECONDS = 30;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values) {
  const valid = values.map(number).filter((value) => value != null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function maximum(values) {
  const valid = values.map(number).filter((value) => value != null);
  return valid.length ? Math.max(...valid) : null;
}

function windowRows(rows, centerS, radiusS) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const timeS = number(row.time_s);
    return timeS != null && Math.abs(timeS - centerS) <= radiusS;
  });
}

function sideFromIndex(index) {
  if (index == null || Math.abs(index) <= 0.1) return "similar";
  return index > 0 ? "left" : "right";
}

export function summarizeMotionAroundClimax(session, radiusS = DEFAULT_CLIMAX_WINDOW_SECONDS) {
  const summary = session?.motion_analysis_summary;
  const climaxS = number(session?.climax_offset_s);
  if (!summary || climaxS == null) return null;

  const motionRows = windowRows(summary.derived_timeline, climaxS, radiusS);
  const cadenceRows = windowRows(summary.hand_cadence_timeline, climaxS, radiusS);
  if (!motionRows.length && !cadenceRows.length) return null;

  const pairedIndices = motionRows.map((row) => {
    const left = number(row.left_lower_body_activity);
    const right = number(row.right_lower_body_activity);
    const total = (left ?? 0) + (right ?? 0);
    return left != null && right != null && total > 0 ? (left - right) / total : null;
  }).filter((value) => value != null);
  const asymmetryIndex = mean(pairedIndices);

  return {
    session,
    radiusS,
    climaxS,
    windowStartS: Math.max(0, climaxS - radiusS),
    windowEndS: climaxS + radiusS,
    motionSampleCount: motionRows.length,
    cadenceSampleCount: cadenceRows.length,
    leftAverage: mean(motionRows.map((row) => row.left_lower_body_activity)),
    rightAverage: mean(motionRows.map((row) => row.right_lower_body_activity)),
    leftMaximum: maximum(motionRows.map((row) => row.left_lower_body_activity)),
    rightMaximum: maximum(motionRows.map((row) => row.right_lower_body_activity)),
    handAverage: mean(motionRows.map((row) => row.hand_activity)),
    handMaximum: maximum(motionRows.map((row) => row.hand_activity)),
    cadenceAverage: mean(cadenceRows.map((row) => row.movement_cycles_per_minute_estimate)),
    cadenceMaximum: maximum(cadenceRows.map((row) => row.movement_cycles_per_minute_estimate)),
    asymmetryIndex,
    sidePattern: sideFromIndex(asymmetryIndex),
  };
}

export function summarizeClimaxMotionHistory(sessions, radiusS = DEFAULT_CLIMAX_WINDOW_SECONDS) {
  const snapshots = (Array.isArray(sessions) ? sessions : [])
    .map((session) => summarizeMotionAroundClimax(session, radiusS))
    .filter(Boolean);
  const withCadence = snapshots.filter((snapshot) => snapshot.cadenceAverage != null);
  const highestCadence = withCadence.reduce((current, snapshot) => (
    !current || snapshot.cadenceMaximum > current.cadenceMaximum ? snapshot : current
  ), null);
  const strongestImbalance = snapshots
    .filter((snapshot) => snapshot.asymmetryIndex != null)
    .reduce((current, snapshot) => (
      !current || Math.abs(snapshot.asymmetryIndex) > Math.abs(current.asymmetryIndex) ? snapshot : current
    ), null);
  const sideCounts = snapshots.reduce((counts, snapshot) => ({
    ...counts,
    [snapshot.sidePattern]: counts[snapshot.sidePattern] + 1,
  }), { left: 0, right: 0, similar: 0 });

  return {
    snapshots,
    withCadence,
    radiusS,
    averageCadence: mean(withCadence.map((snapshot) => snapshot.cadenceAverage)),
    maximumCadence: highestCadence?.cadenceMaximum ?? null,
    highestCadence,
    strongestImbalance,
    sideCounts,
  };
}

