import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "../../../lib/cx";
import s from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 14px leading icon. */
  icon?: ReactNode;
  invalid?: boolean;
  /** Applied to the outer control (width/height overrides). */
  className?: string;
}

export function Input({ icon, invalid, className, ...rest }: InputProps) {
  return (
    <label className={cx(s.input, invalid && s.invalid, className)}>
      {icon && <span className={s.icon}>{icon}</span>}
      <input className={s.field} aria-invalid={invalid || undefined} {...rest} />
    </label>
  );
}

export interface SelectProps {
  value: string;
  /** Shaped like a native `change` event so call sites read `e.target.value`. */
  onChange: (e: { target: { value: string } }) => void;
  /** `<option value="…">label</option>` children (falsy ones are skipped). */
  children: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  /** Applied to the outer control (width overrides). */
  className?: string;
}

interface Opt {
  value: string;
  label: ReactNode;
}

type OptionElement = ReactElement<{ value?: string | number; children?: ReactNode }>;

/** `<option>` children → the rows the list renders. */
function options(children: ReactNode): Opt[] {
  return Children.toArray(children)
    .filter((c): c is OptionElement => isValidElement(c))
    .map((c) => ({ value: String(c.props.value ?? ""), label: c.props.children }));
}

/** Viewport rect for the list: under the field, flipped above it when the bottom edge is close. */
function useDropPosition(open: boolean, anchor: RefObject<HTMLElement | null>, list: RefObject<HTMLElement | null>) {
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
    const below = r.bottom + pad;
    setPos({
      left: Math.max(pad, Math.min(r.left, window.innerWidth - r.width - pad)),
      top: below + h > window.innerHeight - pad ? Math.max(pad, r.top - pad - h) : below,
      width: r.width,
    });
  }, [open, anchor, list]);
  return pos;
}

/**
 * Select (style guide `Select`): input anatomy + chevron, list drawn by the app. A native `<select>`
 * popup is an OS window that ignores the page theme — light-on-dark inside the dark app on Windows.
 *
 * Focus stays on the trigger while the list is open (`aria-activedescendant`), so the surrounding
 * dialog's focus trap and Tab order are unaffected.
 */
export function Select({ value, onChange, children, disabled, autoFocus, className, "aria-label": label }: SelectProps) {
  const opts = options(children);
  const selected = opts.findIndex((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const pos = useDropPosition(open, btn, list);

  // The list is placed once, from the field's rect: close it rather than let it drift.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function show() {
    setActive(Math.max(0, selected));
    setOpen(true);
  }

  function pick(i: number) {
    setOpen(false);
    const o = opts[i];
    if (o && o.value !== value) onChange({ target: { value: o.value } });
  }

  function move(d: number) {
    setActive((i) => Math.min(opts.length - 1, Math.max(0, i + d)));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "Escape") {
      // The list owns Escape while it is open; the dialog behind it must not close too.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(opts.length - 1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        role="combobox"
        className={cx(s.input, s.select, open && s.open, className)}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        <span className={s.value}>{opts[selected]?.label}</span>
        <span className={s.chevron}>{open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            className={s.listbox}
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width }}
            // Keeps focus on the trigger: a click in here must not blur (and so close) the list.
            onMouseDown={(e) => e.preventDefault()}
          >
            {opts.map((o, i) => (
              <div
                key={o.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === selected}
                className={cx(s.opt, i === active && s.optActive, i === selected && s.optSelected)}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(i)}
              >
                {o.label}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
