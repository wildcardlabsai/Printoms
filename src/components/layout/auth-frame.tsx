import * as React from "react";

/** Split-screen frame for sign-in / setup screens. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="relative hidden overflow-hidden bg-[#0d1f19] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(35,160,111,0.35),transparent_55%),radial-gradient(ellipse_at_90%_90%,rgba(35,160,111,0.18),transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-white/10 ring-1 ring-white/20">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
                <path d="M5 7.5 12 4l7 3.5-7 3.5-7-3.5Z" fill="currentColor" />
                <path d="M5 12l7 3.5 7-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".7" />
                <path d="M5 16.5 12 20l7-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".45" />
              </svg>
            </span>
            <span className="text-lg font-semibold tracking-tight">PrintFlow</span>
          </div>
          <div className="max-w-md">
            <p className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em]">
              Every order, every print, every parcel — in one place.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-white/60">
              Etsy and Shopify orders flow into a single production line: prepare, print, check, pack and dispatch
              without losing track of a single item.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-3 text-[13px]">
              {["Orders", "Print farm", "Dispatch"].map((label, i) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur">
                  <div className="mb-3 flex gap-1">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <span key={j} className={`h-1.5 flex-1 rounded-full ${j <= i ? "bg-brand-400" : "bg-white/10"}`} />
                    ))}
                  </div>
                  <span className="text-white/80">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-white/40">Private business system · Authorised users only</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-surface px-5 py-10 sm:px-10">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </div>
  );
}
