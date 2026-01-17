"use client";

import { Sidebar } from "@/components/Sidebar";
import { SearchBar } from "@/components/SearchBar";
import { ActionButtons } from "@/components/ActionButtons";
import { TabsAndFilters } from "@/components/TabsAndFilters";
import { TemplateGrid } from "@/components/TemplateGrid";

export default function Home() {
  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="ml-[72px] flex-1 overflow-y-auto">
        <div className="relative min-h-screen">
          <div className="relative z-10 flex flex-col items-center px-6 pt-14">
            <h1 className="mb-6 text-center font-serif text-3xl font-light tracking-tight text-white">
              O que vamos criar hoje?
            </h1>
            <SearchBar />
            <div className="mt-6">
              <ActionButtons />
            </div>
            <div className="mt-10 w-full max-w-5xl">
              <TabsAndFilters />
            </div>
            <div className="mt-6 w-full max-w-6xl pb-12">
              <TemplateGrid />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
