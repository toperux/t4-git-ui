import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./Checkbox.module.css";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}

/** 16px box + label (style guide `Checkbox`); the native input stays for focus / a11y. */
export function Checkbox({ checked, onChange, disabled, title, children }: CheckboxProps) {
  return (
    <label className={cx(s.check, disabled && s.disabled)} title={title}>
      <input type="checkbox" className={s.input} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={cx(s.box, checked && s.checked)} aria-hidden>
        {checked && <Check size={12} strokeWidth={2.5} />}
      </span>
      {children}
    </label>
  );
}
