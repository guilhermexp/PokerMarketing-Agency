import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../common/Icon";
import { Tooltip, TooltipProvider } from "../common/Tooltip";
import { Menu, X } from "lucide-react";
import type { IconName } from "../../types";

type View = "campaign" | "campaigns" | "flyer" | "gallery" | "calendar" | "playground" | "image-playground";

interface MenuItem {
  icon: IconName;
  label: string;
  key: View;
}

const menuItems: MenuItem[] = [
  { icon: "palette", label: "Dashboard", key: "campaign" },
  { icon: "kanban", label: "Campanhas", key: "campaigns" },
  { icon: "poker-chip", label: "Tournament Flyers", key: "flyer" },
  { icon: "calendar", label: "Agenda", key: "calendar" },
  { icon: "folder-open", label: "Galeria", key: "gallery" },
  { icon: "video", label: "Studio Video", key: "playground" },
  { icon: "image", label: "Image Studio", key: "image-playground" },
];

interface FloatingSidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

export const FloatingSidebar: React.FC<FloatingSidebarProps> = ({
  activeView,
  onViewChange,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNavClick = (view: View) => {
    onViewChange(view);
    // Close mobile menu when item is clicked
    setIsMobileMenuOpen(false);
  };

  return (
    <TooltipProvider delayDuration={100}>
      {/* Mobile Menu Toggle Button - Only visible on mobile */}
      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="fixed right-[26px] bottom-4 z-[10001] pointer-events-auto lg:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-white shadow-lg"
      >
        {isMobileMenuOpen ? (
          <X className="w-5 h-5 text-black" />
        ) : (
          <Menu className="w-5 h-5 text-black" />
        )}
      </motion.button>

      {/* App Logo - Top (Desktop always visible, Mobile only when menu open) */}
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

      {/* Desktop Nav - Always visible on lg+ */}
      <motion.nav
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="fixed left-4 top-1/2 -translate-y-1/2 z-[10000] pointer-events-auto hidden lg:flex flex-col items-center gap-1 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10 py-2 px-2 shadow-[0_25px_90px_rgba(0,0,0,0.7)]"
      >
        {menuItems.map((item) => (
          <Tooltip key={item.key} content={item.label} side="right" sideOffset={12}>
            <button
              onClick={() => handleNavClick(item.key)}
              className={`relative flex items-center justify-center p-2.5 rounded-lg cursor-pointer active:scale-95 transition-all ${
                activeView === item.key
                  ? 'bg-white/20'
                  : 'bg-transparent hover:bg-white/10'
              }`}
            >
              <Icon
                name={item.icon}
                className="w-6 h-6 text-white transition-all duration-150 ease-out"
              />
            </button>
          </Tooltip>
        ))}
      </motion.nav>

      {/* Mobile Nav - Only visible when menu is open */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.nav
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-4 bottom-16 z-[10000] pointer-events-auto lg:hidden flex flex-col-reverse items-center gap-1 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10 py-2 px-2 shadow-[0_25px_90px_rgba(0,0,0,0.7)]"
          >
            {menuItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleNavClick(item.key)}
                className={`relative flex items-center justify-center p-2.5 rounded-lg cursor-pointer active:scale-95 transition-all ${
                  activeView === item.key
                    ? 'bg-white/20'
                    : 'bg-transparent hover:bg-white/10'
                }`}
              >
                <Icon
                  name={item.icon}
                  className="w-6 h-6 text-white transition-all duration-150 ease-out"
                />
              </button>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
};

export default FloatingSidebar;
