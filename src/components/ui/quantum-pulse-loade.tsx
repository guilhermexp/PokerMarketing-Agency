import React from "react";
import { motion } from "framer-motion";

export const GeneratingLoader: React.FC = () => {
  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center bg-black z-[9999]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className="flex flex-col items-center gap-8">
        {/* Shimmer text */}
        <motion.span
          className="text-4xl sm:text-5xl font-light tracking-[0.3em] uppercase
            bg-[linear-gradient(110deg,rgba(255,255,255,0.3),35%,rgba(255,255,255,0.9),50%,rgba(255,255,255,0.3),75%,rgba(255,255,255,0.3))]
            bg-[length:200%_100%] bg-clip-text text-transparent"
          animate={{ backgroundPosition: ["-200% 0", "200% 0"] }}
          transition={{
            repeat: Infinity,
            duration: 2.5,
            ease: "linear",
          }}
        >
          Gerando
        </motion.span>

        {/* Progress bar */}
        <div className="w-48 sm:w-64 h-[2px] bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-transparent via-primary to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              ease: "easeInOut",
            }}
          />
        </div>
      </div>
    </motion.div>
  );
};
