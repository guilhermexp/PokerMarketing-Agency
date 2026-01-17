"use client";

import { Plus, ArrowUp } from "lucide-react";

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
      <path d="M5.636 5.636l2.122 2.122m8.484 8.484l2.122 2.122M5.636 18.364l2.122-2.122m8.484-8.484l2.122-2.122" />
    </svg>
  );
}

export function SearchBar() {
  return (
    <div className="relative w-full max-w-xl">
      <div className="flex items-center gap-3 rounded-full bg-[#1a1a1a] px-4 py-2.5 transition-all focus-within:ring-1 focus-within:ring-white/10">
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700/50 text-zinc-400 transition-all hover:bg-zinc-600/50 hover:text-zinc-200">
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
        <input
          type="text"
          placeholder="Describe your idea..."
          className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
        />
        <button className="flex h-8 w-8 shrink-0 items-center justify-center text-zinc-500 transition-all hover:text-zinc-300">
          <SparklesIcon className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700/50 text-zinc-400 transition-all hover:bg-zinc-600/50 hover:text-zinc-200">
          <ArrowUp className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
