"use client";

import { Package, Sparkles, BookImage, FolderOpen, Settings } from "lucide-react";

const actions = [
  { icon: Package, label: "Produto" },
  { icon: Sparkles, label: "Logo" },
  { icon: BookImage, label: "Ref" },
  { icon: FolderOpen, label: "Ativos" },
  { icon: Settings, label: "Opções" },
];

export function ActionButtons() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {actions.map((action, index) => (
        <button
          key={index}
          className="group flex items-center gap-2 rounded-full border border-zinc-800 bg-transparent px-3.5 py-2 text-xs text-zinc-400 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800/40 hover:text-zinc-200"
        >
          <action.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="font-medium">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
