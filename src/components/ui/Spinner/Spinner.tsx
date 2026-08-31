import { cx } from "../../../lib/cx";
import s from "./Spinner.module.css";

export function Spinner({ size = "md", label = "Loading" }: { size?: "md" | "sm"; label?: string }) {
  return <span className={cx(s.spinner, size === "sm" && s.sm)} role="progressbar" aria-label={label} />;
}
