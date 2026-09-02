import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { RefsSnapshot } from "../../../api/types";
import { cx } from "../../../lib/cx";
import { complete } from "../../../lib/gitCompletions";
import s from "./CommandInput.module.css";

export interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter with nothing highlighted in the list. */
  onSubmit: () => void;
  /** Earlier lines, newest first: ↑ walks them, and matching ones lead the list. */
  history: string[];
  refs: RefsSnapshot | null;
  /** Side the list opens on (`up` for the dock, `down` in a dialog). */
  placement: "up" | "down";
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  placeholder?: string;
  "aria-label": string;
}

/** Viewport rect for the list, above or below the field; re-measured when the row count changes. */
function useListPosition(open: boolean, placement: "up" | "down", anchor: RefObject<HTMLElement | null>, list: RefObject<HTMLElement | null>, count: number) {
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const a = anchor.current;
    const l = list.current;
    if (!a || !l) return;
    const r = a.getBoundingClientRect();
    const h = l.getBoundingClientRect().height;
    const pad = 4;
    setPos({ left: r.left, top: placement === "up" ? Math.max(pad, r.top - pad - h) : r.bottom + pad, width: r.width });
  }, [open, placement, anchor, list, count]);
  return pos;
}

/**
 * A `$ git …` line with completions (lib/gitCompletions) in an app-drawn list under / above it.
 * Focus never leaves the field: the list is `aria-activedescendant`-driven like `Select`, so a
 * dialog's focus trap and Tab order are unaffected. Tab or Enter accept the highlighted row (Tab
 * takes the first without one), Enter without a highlight submits, Escape closes the list before it
 * reaches whatever is behind, and ↑ / ↓ walk the history while the list is closed.
 */
export function CommandInput({ value, onChange, onSubmit, history, refs, placement, disabled, autoFocus, invalid, placeholder, "aria-label": label }: CommandInputProps) {
  // Dismissed (Escape / accept / blur) since the last edit: an edit reopens it.
  const [closed, setClosed] = useState(false);
  const [active, setActive] = useState(-1);
  // Walking the history: which entry is shown, and what was typed before ↑ was pressed.
  const [hist, setHist] = useState<{ index: number; draft: string } | null>(null);
  const wrap = useRef<HTMLLabelElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const { items, replaceFrom } = useMemo(() => complete(value, refs, history), [value, refs, history]);
  const open = !closed && !disabled && value.trim() !== "" && items.length > 0;
  const pos = useListPosition(open, placement, wrap, list, items.length);

  // The list is placed once, from the field's rect: close it rather than let it drift.
  useEffect(() => {
    if (!open) return;
    const close = (e?: Event) => {
      if (e?.target instanceof Node && list.current?.contains(e.target)) return;
      setClosed(true);
    };
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) list.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function change(next: string) {
    onChange(next);
    setClosed(false);
    setActive(-1);
    setHist(null);
  }

  function accept(i: number) {
    const item = items[i];
    if (!item) return;
    onChange(item.kind === "history" ? item.text : `${value.slice(0, replaceFrom)}${item.text} `);
    setClosed(true);
    setActive(-1);
    setHist(null);
  }

  function walkHistory(d: 1 | -1) {
    const next = (hist?.index ?? -1) + d;
    if (next < -1 || next >= history.length) return;
    const draft = hist?.draft ?? value;
    onChange(next === -1 ? draft : history[next]);
    setHist(next === -1 ? null : { index: next, draft });
    setClosed(true);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const d = e.key === "ArrowDown" ? 1 : -1;
      if (open) {
        e.preventDefault();
        setActive((a) => Math.min(items.length - 1, Math.max(-1, a + d)));
      } else if (history.length > 0) {
        // ↑ goes further back in time, ↓ forward to the draft.
        e.preventDefault();
        walkHistory(d === 1 ? -1 : 1);
      }
    } else if (e.key === "Tab") {
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();
      accept(active >= 0 ? active : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0) accept(active);
      else onSubmit();
    } else if (e.key === "Escape") {
      if (!open) return;
      // The list owns Escape while it is open; the dialog behind it must not close too.
      e.preventDefault();
      e.stopPropagation();
      setClosed(true);
      setActive(-1);
    }
  }

  return (
    <>
      <label ref={wrap} className={cx(s.wrap, invalid && s.invalid)}>
        <span className={s.prefix} aria-hidden>
          $ git
        </span>
        <input
          className={s.field}
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
          aria-invalid={invalid || undefined}
          value={value}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setClosed(true)}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label="Completions"
            className={s.listbox}
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width }}
            // Keeps focus in the field: a click in here must not blur (and so close) the list.
            onMouseDown={(e) => e.preventDefault()}
          >
            {items.map((item, i) => (
              <div
                key={`${item.kind}:${item.text}`}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cx(s.opt, i === active && s.optActive)}
                onMouseMove={() => setActive(i)}
                onClick={() => accept(i)}
              >
                <span className={s.optText}>{item.text}</span>
                <span className={s.optHint}>{item.hint}</span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
