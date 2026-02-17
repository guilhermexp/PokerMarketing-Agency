import React from 'react';

type StudioMode = 'direct' | 'agent';

interface StudioAgentToggleProps {
  mode: StudioMode;
  onChange: (mode: StudioMode) => void;
}

export const StudioAgentToggle: React.FC<StudioAgentToggleProps> = ({ mode, onChange }) => {
  return (
    <div className="inline-flex items-center rounded-xl border border-white/[0.08] bg-white/[0.03] p-0.5">
      <button
        onClick={() => onChange('direct')}
        className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
          mode === 'direct'
            ? 'bg-white/[0.1] text-white shadow-sm'
            : 'text-white/40 hover:text-white/60'
        }`}
      >
        Direto
      </button>
      <button
        onClick={() => onChange('agent')}
        className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
          mode === 'agent'
            ? 'bg-white/[0.1] text-white shadow-sm'
            : 'text-white/40 hover:text-white/60'
        }`}
      >
        Agente
      </button>
    </div>
  );
};

export default StudioAgentToggle;
