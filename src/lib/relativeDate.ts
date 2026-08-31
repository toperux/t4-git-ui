const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Short relative date for grid cells: `just now`, `5m ago`, `2h ago`, `Yesterday`,
 * `3d ago` (up to 6 days), then `Aug 29` (same year) or `Aug 29, 2025`.
 * @param unixSeconds commit time (UTC seconds)
 * @param now reference time in ms (defaults to `Date.now()`)
 */
export function relativeDate(unixSeconds: number, now: number = Date.now()): string {
  const then = unixSeconds * 1000;
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;

  const d = new Date(then);
  const n = new Date(now);
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((dayStart(n) - dayStart(d)) / 86400000);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === n.getFullYear() ? label : `${label}, ${d.getFullYear()}`;
}

/** Absolute timestamp for the details pane: `Aug 31, 2026 14:02`. */
export function absoluteDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
