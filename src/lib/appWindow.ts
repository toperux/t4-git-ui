import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * This window's Tauri label: `main`, or `w<n>` for one `spawn_window` created. Outside Tauri (jsdom,
 * the Vite tab) there is one window and it behaves as the main one.
 */
export function windowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

/** The main window keeps what only one window may do: the launch layout and the update check. */
export const isMainWindow = () => windowLabel() === "main";

/** Closes this window — the last tab of a secondary window goes with it. */
export function closeThisWindow() {
  try {
    void getCurrentWindow()
      .close()
      .catch(() => {});
  } catch {
    /* outside Tauri */
  }
}
