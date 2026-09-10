import { cx } from "../../../lib/cx";
import s from "./Progress.module.css";

/** Progress line: indeterminate, or the bar filled to `value` (0–100) once a percentage is known. */
export function Progress({ thin, label = "Loading", value }: { thin?: boolean; label?: string; value?: number }) {
  // A percentage the bar itself shows is also one a screen reader must be able to read out; without
  // one the element stays the "busy, no idea how long" progressbar that carries no values at all.
  const known = value !== undefined;
  return (
    <div
      className={cx(s.progress, thin && s.thin)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={known ? value : undefined}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
    >
      <div className={cx(s.bar, known && s.filled)} style={known ? { width: `${value}%` } : undefined} />
    </div>
  );
}
