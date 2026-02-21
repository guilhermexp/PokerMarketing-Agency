import React, { useState } from "react";
import { authClient } from "../../lib/auth-client";

// Better Auth organization client uses Proxy — methods exist at runtime but TS doesn't type them
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orgApi = authClient.organization as any;

export function OrgSwitcher() {
  const { data: orgs } = authClient.useListOrganizations();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [isCreating, setIsCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const handleSetActive = async (orgId: string | null) => {
    await orgApi.setActive({ organizationId: orgId });
    setIsOpen(false);
  };

  const handleCreate = async () => {
    if (!newOrgName.trim()) return;
    try {
      const result = await orgApi.create({
        name: newOrgName.trim(),
        slug: newOrgName.trim().toLowerCase().replace(/\s+/g, "-"),
      });
      if (result.data) {
        await orgApi.setActive({ organizationId: result.data.id });
      }
      setNewOrgName("");
      setIsCreating(false);
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to create organization:", err);
    }
  };

  const orgList = orgs || [];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border bg-black/40 text-white/80 hover:bg-white/5 transition-colors"
      >
        <span className="truncate max-w-[140px]">
          {activeOrg?.name || "Pessoal"}
        </span>
        <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-56 rounded-xl border border-border bg-black/95 backdrop-blur-xl shadow-xl z-50 overflow-hidden">
            <div className="p-1">
              {/* Personal context */}
              <button
                onClick={() => handleSetActive(null)}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                  !activeOrg ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5"
                }`}
              >
                Pessoal
              </button>

              {/* Org list */}
              {orgList.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSetActive(org.id)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                    activeOrg?.id === org.id ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5"
                  }`}
                >
                  {org.name}
                </button>
              ))}

              {/* Divider */}
              <div className="my-1 border-t border-border" />

              {/* Create new org */}
              {isCreating ? (
                <div className="p-2 space-y-2">
                  <input
                    type="text"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="Nome da organizacao"
                    className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-black/40 text-white placeholder:text-white/35 focus:border-amber-400 focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") setIsCreating(false);
                    }}
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleCreate}
                      className="flex-1 px-2 py-1 text-xs rounded-lg bg-white/10 text-white hover:bg-white/15 transition-colors"
                    >
                      Criar
                    </button>
                    <button
                      onClick={() => setIsCreating(false)}
                      className="flex-1 px-2 py-1 text-xs rounded-lg text-white/50 hover:bg-white/5 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full text-left px-3 py-2 text-sm text-amber-400 hover:bg-white/5 rounded-lg transition-colors"
                >
                  + Nova organizacao
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
