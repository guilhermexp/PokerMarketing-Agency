"use client";

import { Home, FolderOpen, LayoutGrid, Image, Video, Clapperboard, Mic, FlaskConical } from "lucide-react";

const topItems = [
  { icon: Home, label: "Home", active: true, filled: true },
  { icon: FolderOpen, label: "Projects" },
  { icon: LayoutGrid, label: "Assets" },
];

const groupedItems = [
  { icon: Image, label: "Gallery" },
  { icon: Video, label: "Video" },
  { icon: Clapperboard, label: "Editor" },
  { icon: Mic, label: "Voice" },
  { icon: FlaskConical, label: "Lab" },
];

const bottomItems: { icon: typeof Home; label: string }[] = [];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-[72px] flex-col items-center bg-[#0a0a0a] py-4 border-r border-white/5">
      <nav className="flex flex-1 flex-col items-center gap-1">
        {topItems.map((item, index) => (
          <button
            key={index}
            className={`group flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200 ${
              item.active
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
            }`}
          >
            <item.icon className="h-5 w-5" strokeWidth={item.filled ? 2 : 1.5} fill={item.filled ? "currentColor" : "none"} />
          </button>
        ))}
        
        <div className="my-2 flex flex-col items-center rounded-2xl bg-zinc-900/80 py-2 px-1">
          {groupedItems.map((item, index) => (
            <button
              key={index}
              className="group flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-all duration-200 hover:text-zinc-300"
            >
              <item.icon className="h-5 w-5" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </nav>
      
        <div className="flex flex-col items-center gap-1 pb-2">
          <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-sm font-semibold text-white">
            G
          </div>
        </div>
    </aside>
  );
}
