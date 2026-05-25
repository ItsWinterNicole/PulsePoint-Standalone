function formatActivity(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : "--";
}

export default function SideBalanceGauge({ left, right, title = "Left Vs Right Activity At Cursor" }) {
  const leftValue = Number(left);
  const rightValue = Number(right);
  const hasValues = Number.isFinite(leftValue) || Number.isFinite(rightValue);
  const safeLeft = Number.isFinite(leftValue) ? Math.max(0, leftValue) : 0;
  const safeRight = Number.isFinite(rightValue) ? Math.max(0, rightValue) : 0;
  const total = safeLeft + safeRight;
  const index = total > 0 ? (safeLeft - safeRight) / total : 0;
  const markerPosition = 50 - (index * 50);
  const leftWidth = index > 0 ? index * 50 : 0;
  const rightWidth = index < 0 ? Math.abs(index) * 50 : 0;
  const balanceText = !hasValues || total === 0
    ? "No activity at cursor"
    : Math.abs(index) <= 0.1
      ? "Broadly similar"
      : `${index > 0 ? "Left" : "Right"} higher`;

  return (
    <div className="rounded-lg border border-border bg-muted/15 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <span className="text-[11px] font-medium text-foreground">{balanceText}</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="w-16 text-right font-mono font-semibold text-primary">{formatActivity(left)}</span>
        <div className="relative h-4 flex-1 overflow-hidden rounded-full border border-border bg-background">
          <div className="absolute bottom-0 left-1/2 top-0 w-px bg-border" />
          {leftWidth > 0 && (
            <div
              className="absolute bottom-0 top-0 bg-primary/80"
              style={{ right: "50%", width: `${leftWidth}%` }}
            />
          )}
          {rightWidth > 0 && (
            <div
              className="absolute bottom-0 top-0 bg-amber-400/85"
              style={{ left: "50%", width: `${rightWidth}%` }}
            />
          )}
          <div
            className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-foreground shadow"
            style={{ left: `${markerPosition}%` }}
          />
        </div>
        <span className="w-16 font-mono font-semibold text-amber-400">{formatActivity(right)}</span>
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Left foot / leg</span>
        <span>Balanced</span>
        <span>Right foot / leg</span>
      </div>
    </div>
  );
}
