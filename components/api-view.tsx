/*
  App-local components for the engineering view.
  The demo is visual-first; this panel reveals the underlying request/response JSON
  for the current step so it can be discussed with engineering.
*/
"use client";

import { useState, type ReactNode } from "react";

export function Json({ label, data }: { label: string; data: unknown }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-faint)] mb-1.5">{label}</div>
      <pre className="text-[12px] leading-relaxed font-mono bg-[#0f1115] text-[#e6e6e6] rounded-[var(--radius)] p-3.5 overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export function EngineeringPanel({ blocks }: { blocks: { label: string; data: unknown }[] }) {
  const [open, setOpen] = useState(false);
  if (!blocks.length) return null;
  return (
    <div className="mt-4 border border-[var(--color-line)] rounded-[var(--radius)] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 h-11 text-[13px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
      >
        <span className="font-mono">{"</>"} Engineering view · request / response</span>
        <span className="text-[var(--color-faint)]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--color-line)] p-4 space-y-4 bg-[var(--color-bg)] animate-fadeup">
          {blocks.map((b, i) => (
            <Json key={i} label={b.label} data={b.data} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Split({ api, product }: { api: ReactNode; product: ReactNode }) {
  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="space-y-3">{api}</div>
      <div className="space-y-3">{product}</div>
    </div>
  );
}
