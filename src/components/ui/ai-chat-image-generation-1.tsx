import * as React from "react"
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface ImageGenerationLoaderProps {
  /** Image URL - when provided, shows the reveal effect */
  imageSrc?: string | null;
  /** Image prompt to show as placeholder when no image */
  prompt?: string;
  /** Optional className for the container */
  className?: string;
  /** Whether currently generating */
  isGenerating?: boolean;
  /** Show animated status label text */
  showLabel?: boolean;
  /** Callback when reveal animation completes */
  onRevealComplete?: () => void;
}

export const ImageGenerationLoader = ({
  imageSrc,
  prompt,
  className,
  isGenerating = true,
  showLabel = true,
  onRevealComplete,
}: ImageGenerationLoaderProps) => {
  const [loadingState, setLoadingState] = React.useState<
    "waiting" | "generating" | "revealing" | "completed"
  >("waiting");
  const [isImageLoaded, setIsImageLoaded] = React.useState(false);
  const [currentImageSrc, setCurrentImageSrc] = React.useState<string | null>(null);

  // Track when image URL changes to reset loaded state
  React.useEffect(() => {
    if (imageSrc !== currentImageSrc) {
      setIsImageLoaded(false);
      setCurrentImageSrc(imageSrc);
    }
  }, [imageSrc, currentImageSrc]);

  // Handle state transitions - only start reveal when image is fully loaded
  React.useEffect(() => {
    if (imageSrc && isImageLoaded && loadingState !== "revealing" && loadingState !== "completed") {
      // Show the image immediately when it has fully loaded.
      setLoadingState("completed");
      onRevealComplete?.();
    } else if (!imageSrc && isGenerating) {
      // No image yet, start generating state after delay
      const timeout = setTimeout(() => {
        setLoadingState("generating");
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [imageSrc, isImageLoaded, isGenerating, loadingState, onRevealComplete]);

  // Reset when starting new generation
  React.useEffect(() => {
    if (isGenerating && !imageSrc) {
      setLoadingState("waiting");
    }
  }, [isGenerating, imageSrc]);

  const handleImageLoad = () => {
    setIsImageLoaded(true);
  };

  const isCompleted = loadingState === "completed";
  const showLoader = !imageSrc && isGenerating;

  return (
    <div className={cn("relative w-full h-full overflow-hidden", className)}>
      {/* Image (when available) */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt="Generated"
          className="w-full h-full object-cover"
          onLoad={handleImageLoad}
          style={{ opacity: isImageLoaded || !isGenerating ? 1 : 0 }}
        />
      )}

      {/* Placeholder when no image */}
      {!imageSrc && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-black/30">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          {prompt && (
            <p className="text-[8px] text-muted-foreground italic line-clamp-3 max-w-[80%]">
              "{prompt}"
            </p>
          )}
        </div>
      )}

      {/* Blur overlay that reveals from top to bottom */}
      <AnimatePresence>
        {showLoader && !isCompleted && (
          <motion.div
            className="absolute inset-0 pointer-events-none backdrop-blur-2xl bg-black/40"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      {/* Loading text - Centralized */}
      <AnimatePresence>
        {showLabel && showLoader && !isCompleted && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center z-20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <motion.span
              className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm
                bg-[linear-gradient(110deg,rgba(255,255,255,0.4),35%,rgba(255,255,255,0.8),50%,rgba(255,255,255,0.4),75%,rgba(255,255,255,0.4))]
                bg-[length:200%_100%] bg-clip-text text-transparent"
              animate={{ backgroundPosition: ["-200% 0", "200% 0"] }}
              transition={{
                repeat: Infinity,
                duration: 2,
                ease: "linear",
              }}
            >
              {loadingState === "waiting" ? "Iniciando..." : "Gerando imagem..."}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

ImageGenerationLoader.displayName = "ImageGenerationLoader";
