"use client";

import { useState } from "react";
import { Star, Sparkles, ArrowLeftRight, Sun, Dumbbell, Wand2, Rewind, Music, Megaphone, Snowflake } from "lucide-react";

const tabs = ["Explore", "Library", "Elements", "Learn"];

const categories = [
  { icon: null, label: "All templates", active: true },
  { icon: Star, label: "Popular" },
  { icon: Sparkles, label: "Stylized" },
  { icon: ArrowLeftRight, label: "Swap" },
  { icon: Sun, label: "Glow Up" },
  { icon: Wand2, label: "Meme" },
  { icon: Dumbbell, label: "Sports" },
  { icon: Sparkles, label: "Fantasy" },
  { icon: Rewind, label: "Retro" },
  { icon: Music, label: "Music Video" },
  { icon: Megaphone, label: "Marketing" },
  { icon: Snowflake, label: "Holiday" },
];

export function TabsAndFilters() {
  const [activeTab, setActiveTab] = useState("Explore");
  const [activeCategory, setActiveCategory] = useState("All templates");

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-6 border-b border-white/10 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-sm font-medium transition-colors ${
              activeTab === tab
                ? "text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
        <div className="flex items-center">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category.label}
                onClick={() => setActiveCategory(category.label)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  activeCategory === category.label
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-300"
                }`}
              >
                {category.icon && <category.icon className="h-3.5 w-3.5" />}
                {category.label}
              </button>
            ))}
          </div>
        </div>
    </div>
  );
}
