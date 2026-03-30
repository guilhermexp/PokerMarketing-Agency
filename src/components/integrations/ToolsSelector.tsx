/**
 * Tool selection list for a Composio toolkit.
 *
 * Shows all available tools with checkboxes, search, select all/clear,
 * and highlights "Important" tools (those with openWorldHintImportant tag).
 */

import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/common/Button";
import { Icon } from "@/components/common/Icon";
import { Loader } from "@/components/common/Loader";
import { useComposioTools } from "@/hooks/useComposio";

interface ToolsSelectorProps {
  toolkitSlug: string;
  toolkitName: string;
  selectedTools: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
}

export function ToolsSelector({
  toolkitSlug,
  toolkitName,
  selectedTools,
  onSelectionChange,
}: ToolsSelectorProps) {
  const { tools, isLoading } = useComposioTools(toolkitSlug);
  const [search, setSearch] = useState("");

  const filteredTools = useMemo(() => {
    if (!search.trim()) return tools;
    const q = search.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [tools, search]);

  const isImportant = (tags: string[] | undefined) =>
    tags?.some((t) => t.toLowerCase().includes("important")) ?? false;

  const handleToggle = (name: string) => {
    const next = new Set(selectedTools);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    onSelectionChange(next);
  };

  const handleSelectAll = () => {
    onSelectionChange(new Set(tools.map((t) => t.name)));
  };

  const handleClear = () => {
    onSelectionChange(new Set());
  };

  const handleSelectImportant = () => {
    const important = tools.filter((t) => isImportant(t.tags)).map((t) => t.name);
    onSelectionChange(new Set(important));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader size={20} className="text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selectedTools.size} de {tools.length} tools selecionadas
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={handleSelectImportant}>
            Recomendadas
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSelectAll}>
            Todas
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Limpar
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Icon
          name="search"
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tools..."
          className="pl-9 h-8 text-xs"
        />
      </div>

      {/* Tools list */}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {filteredTools.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nenhuma tool encontrada
          </p>
        ) : (
          filteredTools.map((tool) => {
            const checked = selectedTools.has(tool.name);
            const important = isImportant(tool.tags);
            const paramCount = Object.keys(
              (tool.parameters as Record<string, unknown>)?.properties ?? {},
            ).length;

            return (
              <label
                key={tool.name}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  checked
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-card/30 hover:bg-card/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggle(tool.name)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {tool.name}
                    </span>
                    {important && (
                      <Badge variant="default" className="text-[9px] px-1.5 py-0">
                        Important
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground line-clamp-2">
                    {tool.description}
                  </p>
                  {paramCount > 0 && (
                    <span className="mt-1 inline-block text-[9px] text-muted-foreground/70">
                      {paramCount} params
                    </span>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
