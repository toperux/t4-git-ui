import { ChevronUp, Terminal } from "lucide-react";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../components/ui/PanelHeader/PanelHeader";
import s from "./RepoWindow.module.css";

/** Collapsed output dock (static in M1; streaming output arrives in M4). */
export function OutputDock() {
  return (
    <PanelHeader className={s.dock} icon={<Terminal size={14} aria-hidden />} title={<span className={s.dockText}>No output yet</span>}>
      <IconButton label="Expand output" title="Coming in M4" disabled>
        <ChevronUp size={14} aria-hidden />
      </IconButton>
    </PanelHeader>
  );
}
