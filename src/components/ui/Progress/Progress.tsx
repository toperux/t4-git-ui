import { cx } from "../../../lib/cx";
import s from "./Progress.module.css";

/** Indeterminate progress line. */
export function Progress({ thin, label = "Loading" }: { thin?: boolean; label?: string }) {
  return (
    <div className={cx(s.progress, thin && s.thin)} role="progressbar" aria-label={label}>
      <div className={s.bar} />
    </div>
  );
}
