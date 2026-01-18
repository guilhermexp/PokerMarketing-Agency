import React from "react";
import { motion } from "framer-motion";
import { Icon } from "../common/Icon";
import { Tooltip, TooltipProvider } from "../common/Tooltip";
import type { IconName } from "../../types";

type View = "campaign" | "campaigns" | "flyer" | "gallery" | "calendar" | "playground";

interface MenuItem {
  icon: IconName;
  label: string;
  key: View;
}

const menuItems: MenuItem[] = [
  { icon: "zap", label: "Direct", key: "campaign" },
  { icon: "layers", label: "Campanhas", key: "campaigns" },
  { icon: "image", label: "Flyers", key: "flyer" },
  { icon: "calendar", label: "Agenda", key: "calendar" },
  { icon: "layout", label: "Galeria", key: "gallery" },
  { icon: "video", label: "Playground", key: "playground" },
];

interface FloatingSidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

export const FloatingSidebar: React.FC<FloatingSidebarProps> = ({
  activeView,
  onViewChange,
}) => {
  return (
    <TooltipProvider delayDuration={100}>
      {/* App Logo - Top */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.1 }}
        className="fixed left-4 top-4 z-[10000] pointer-events-auto hidden lg:flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10 p-2.5 shadow-[0_25px_90px_rgba(0,0,0,0.7)]"
      >
        <img
          src="/logo-socialab.png"
          alt="Socialab"
          className="w-8 h-8"
        />
      </motion.div>

      <motion.nav
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="fixed left-4 top-1/2 -translate-y-1/2 z-[10000] pointer-events-auto hidden lg:flex flex-col items-center gap-1 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10 py-2 px-2 shadow-[0_25px_90px_rgba(0,0,0,0.7)]"
      >
        {menuItems.map((item) => (
          <Tooltip key={item.key} content={item.label} side="right" sideOffset={12}>
            <button
              onClick={() => onViewChange(item.key)}
              className="relative flex items-center justify-center p-2.5 cursor-pointer active:scale-95 transition-transform"
            >
              <Icon
                name={item.icon}
                className={`w-6 h-6 transition-all duration-150 ease-out ${
                  activeView === item.key ? 'opacity-100 scale-110' : 'opacity-35'
                }`}
              />
            </button>
          </Tooltip>
        ))}
      </motion.nav>
    </TooltipProvider>
  );
};

export default FloatingSidebar;
