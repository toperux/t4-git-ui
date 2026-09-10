import { ArrowUpCircle } from "lucide-react";
import { useUpdateStore } from "../../../store/updateStore";
import { Button } from "../Button/Button";

/**
 * The "an update is waiting" marker beside the Settings gear on both screens. A `sm` primary Button
 * rather than a `Badge`: it is clickable, and a 16px badge is under the 24px hit-target floor.
 * It is only a shortcut into Settings › Updates — the check and the install live there — and it
 * renders nothing until a check has found a version.
 */
export function UpdateBadge({ onClick }: { onClick: () => void }) {
  const info = useUpdateStore((st) => st.info);
  if (!info) return null;
  return (
    <Button
      variant="primary"
      size="sm"
      icon={<ArrowUpCircle size={14} aria-hidden />}
      title={`Version ${info.version} is available — open Settings`}
      onClick={onClick}
    >
      Update
    </Button>
  );
}
