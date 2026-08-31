import { createPortal } from "react-dom";
import { Spinner } from "../Spinner/Spinner";
import s from "./BusyOverlay.module.css";

/**
 * Full-window scrim + card for a blocking wait (opening a repository). Appears after a short delay
 * so fast opens never flash it; while shown it also swallows clicks, so the wait can't be doubled.
 */
export function BusyOverlay({ label }: { label: string }) {
  return createPortal(
    <div className={s.scrim} role="status">
      <div className={s.card}>
        <Spinner label={label} />
        {label}
      </div>
    </div>,
    document.body,
  );
}
