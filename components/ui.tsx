/*
  Minimal UI kit. Every primitive earns its place.
  Keep this small. If a component isn't used by two flows, inline it instead.
*/
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/* ---------- Button ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[var(--radius)] text-[15px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:opacity-90"
      : "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-line)]/60";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

/* ---------- Field ---------- */
type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};
export function Field({ label, hint, error, className = "", ...props }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-[var(--color-ink)] mb-1.5">{label}</span>
      <input
        className={`w-full h-11 px-3.5 rounded-[var(--radius)] bg-[var(--color-surface)] border text-[15px] placeholder:text-[var(--color-faint)] ${
          error ? "border-[var(--color-bad)]" : "border-[var(--color-line)]"
        } ${className}`}
        {...props}
      />
      {error ? (
        <span className="block text-[12px] text-[var(--color-bad)] mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-[12px] text-[var(--color-muted)] mt-1.5">{hint}</span>
      ) : null}
    </label>
  );
}

/* ---------- Select ---------- */
type SelectProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
};
export function Select({ label, value, onChange, options, hint }: SelectProps) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-[var(--color-ink)] mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-3.5 rounded-[var(--radius)] bg-[var(--color-surface)] border border-[var(--color-line)] text-[15px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="block text-[12px] text-[var(--color-muted)] mt-1.5">{hint}</span> : null}
    </label>
  );
}

/* ---------- Card ---------- */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[14px] ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------- Stepper (progress, not navigation) ---------- */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "now" : "next";
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`h-1.5 w-8 rounded-full ${
                state === "next" ? "bg-[var(--color-line)]" : "bg-[var(--color-accent)]"
              }`}
            />
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- StatusPill ---------- */
type Tone = "neutral" | "good" | "warn" | "bad";
export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const map: Record<Tone, string> = {
    neutral: "bg-[var(--color-line)] text-[var(--color-muted)]",
    good: "bg-[var(--color-good-bg)] text-[var(--color-good)]",
    warn: "bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
    bad: "bg-[var(--color-bad-bg)] text-[var(--color-bad)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

/* ---------- Row (label + value, the workhorse of a review screen) ---------- */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-[var(--color-line)] last:border-0">
      <span className="text-[13px] text-[var(--color-muted)]">{label}</span>
      <span className="text-[14px] text-[var(--color-ink)] text-right">{value}</span>
    </div>
  );
}
