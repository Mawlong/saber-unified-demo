import type { Metadata } from "next";
import "./globals.css";
import saberLogo from "../public/saber-logo.avif";
import saberWordmark from "../public/saber-wordmark.avif";

export const metadata: Metadata = {
  title: "Unified transaction API — Saber prototype",
  description: "Saber prototype: Unified transaction API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
            <span className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={saberLogo.src} alt="Saber logo" className="h-7 w-auto" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={saberWordmark.src} alt="Saber" className="h-4 w-auto" />
              <span className="text-[13px] text-[var(--color-faint)] ml-1">/ unified transaction demo</span>
            </span>
            <span className="text-[12px] text-[var(--color-faint)]">internal · not production</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
