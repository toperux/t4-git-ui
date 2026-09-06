import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { useRepoStore } from "../store/repoStore";
import { APP_NAME } from "./app";

/** Keeps the window title on the open repository: `T4 Git - <name>`, or `T4 Git` with none open. */
export function useWindowTitle() {
  const name = useRepoStore((st) => st.repo?.name);
  useEffect(() => {
    const title = name ? `${APP_NAME} - ${name}` : APP_NAME;
    document.title = title;
    try {
      void getCurrentWindow()
        .setTitle(title)
        .catch(() => {});
    } catch {
      /* outside Tauri (jsdom, the Vite tab) */
    }
  }, [name]);
}
