"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setExpanded(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = inputRef.current?.value.trim() ?? "";
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    inputRef.current?.blur();
    setExpanded(false);
  };

  return (
    <>
      <button
        className="rounded-lg p-2 text-ink-2 hover:bg-zinc-100 md:hidden"
        aria-label="Search"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <Search className="size-5" />
      </button>
      <form
        onSubmit={submit}
        role="search"
        className={cn(
          "items-center md:relative md:flex",
          expanded
            ? "fixed inset-x-0 top-0 z-40 flex h-14 gap-2 border-b border-line bg-white px-3 md:static md:h-auto md:border-0 md:bg-transparent md:p-0"
            : "hidden",
        )}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input
            ref={inputRef}
            type="search"
            name="q"
            placeholder="Search orders, customers, products…"
            onBlur={() => setTimeout(() => setExpanded(false), 150)}
            className="h-9 w-full rounded-lg border border-line bg-subtle pr-12 pl-9 text-sm text-ink placeholder:text-faint transition focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-brand-500/15 md:w-[260px] lg:w-[320px]"
            aria-label="Search PrintFlow"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 items-center gap-0.5 md:flex">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
        {expanded ? (
          <button type="button" className="px-2 text-sm font-medium text-muted md:hidden" onClick={() => setExpanded(false)}>
            Cancel
          </button>
        ) : null}
      </form>
    </>
  );
}
