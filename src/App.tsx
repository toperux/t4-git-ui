import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type AppError = { kind: string; message: string };

function toAppError(e: unknown): AppError {
  if (typeof e === "object" && e !== null && "kind" in e && "message" in e) {
    return e as AppError;
  }
  return { kind: "unknown", message: String(e) };
}

export default function App() {
  const [text, setText] = useState("probing git...");

  useEffect(() => {
    invoke<string>("probe_git")
      .then(setText)
      .catch((e: unknown) => {
        const err = toAppError(e);
        setText(`error (${err.kind}): ${err.message}`);
      });
  }, []);

  return <div style={{ padding: "var(--space-6)" }}>{text}</div>;
}
