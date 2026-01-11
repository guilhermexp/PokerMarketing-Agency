import React, { Fragment } from "react";
import { motion } from "framer-motion";
import { Icon } from "./common/Icon";
import { Tooltip, TooltipProvider } from "./common/Tooltip";
import type { IconName } from "../types";

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
  brandProfile: {
    name: string;
    logo: string | null;
  };
  onEditProfile: () => void;
  onSignOut: () => void;
}

export const FloatingSidebar: React.FC<FloatingSidebarProps> = ({
  activeView,
  onViewChange,
  brandProfile,
  onEditProfile,
  onSignOut,
}) => {
  return (
    <TooltipProvider delayDuration={100}>
      <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[10000] pointer-events-auto hidden sm:block">
        <motion.nav
        initial={{ x: -20, opacity: 0, scale: 0.95 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="flex flex-col items-center py-2 px-1.5 bg-[#0a0a0a] border border-white/[0.08] rounded-xl shadow-2xl"
      >
        {/* Logo */}
        <Tooltip content="Socialab" side="right" sideOffset={12}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center justify-center w-9 h-9 rounded-lg mb-1"
          >
            <img
              src="/icon.png"
              alt="Socialab"
              className="h-7 w-7 rounded-lg"
            />
          </motion.button>
        </Tooltip>

        {/* Separator */}
        <div className="w-6 h-px bg-white/[0.08] my-1" />

        {/* Navigation Items */}
        <div className="flex flex-col items-center gap-1">
          {menuItems.map((item, index) => (
            <Fragment key={item.key}>
              {index === 2 && <div className="w-6 h-px bg-white/[0.08] my-1" />}
              <Tooltip content={item.label} side="right" sideOffset={12}>
                <motion.button
                  onClick={() => onViewChange(item.key)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 cursor-pointer ${
                    activeView === item.key
                      ? "bg-white/[0.12] text-white"
                      : "text-white/50 hover:text-white hover:bg-white/[0.08]"
                  }`}
                >
                  <Icon name={item.icon} className="h-5 w-5" />
                </motion.button>
              </Tooltip>
            </Fragment>
          ))}
        </div>

        {/* Separator */}
        <div className="w-6 h-px bg-white/[0.08] my-1.5" />

        {/* Footer Actions */}
        <div className="flex flex-col items-center gap-1">
          <Tooltip content={brandProfile.name} side="right" sideOffset={12}>
            <motion.button
              onClick={onEditProfile}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-all duration-150 cursor-pointer"
            >
              {brandProfile.logo ? (
                <img
                  src={brandProfile.logo}
                  alt="Logo"
                  className="h-5 w-5 rounded object-cover"
                />
              ) : (
                <span className="text-[10px] font-bold">
                  {brandProfile.name.substring(0, 2).toUpperCase()}
                </span>
              )}
            </motion.button>
          </Tooltip>

          <Tooltip content="Sair" side="right" sideOffset={12}>
            <motion.button
              onClick={onSignOut}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 cursor-pointer"
            >
              <Icon name="log-out" className="h-4 w-4" />
            </motion.button>
          </Tooltip>
        </div>
        </motion.nav>
      </div>
    </TooltipProvider>
  );
};

export default FloatingSidebar;
