/**
 * Global type declarations
 */

interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

declare global {
  interface Window {
    aistudio?: AIStudio;
  }
}

declare module "lucide-react/dist/esm/icons/*.js" {
  import type { ComponentType, SVGProps } from "react";

  const IconComponent: ComponentType<
    SVGProps<SVGSVGElement> & {
      size?: number | string;
      strokeWidth?: number | string;
    }
  >;

  export default IconComponent;
}

export {};
