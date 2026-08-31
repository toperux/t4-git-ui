import { ChevronDown } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
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

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

/** Native select with the Input anatomy (chevron-down 14). */
export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <label className={cx(s.input, s.select, className)}>
      <select className={s.selectField} {...rest}>
        {children}
      </select>
      <span className={s.chevron}>
        <ChevronDown size={14} aria-hidden />
      </span>
    </label>
  );
}
