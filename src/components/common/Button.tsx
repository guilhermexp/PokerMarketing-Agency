import React from "react";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { Loader } from "./Loader";
import { cn } from "@/lib/utils";

const variantMap = {
  primary: "glass",
  secondary: "solid",
  ghost: "glass-subtle",
  outline: "outline-subtle",
} as const;

const sizeClasses = {
  normal: "h-auto px-5 py-2.5 text-[10px]",
  large: "h-auto px-6 py-3 text-sm",
  small: "h-auto px-4 py-2.5 text-[10px]",
  sm: "h-auto px-3 py-1.5 text-[10px]",
};

const iconSizeClasses = {
  normal: "w-4 h-4",
  large: "w-5 h-5",
  small: "w-3.5 h-3.5",
  sm: "w-3 h-3",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "normal" | "large" | "small" | "sm";
  icon?: IconName;
  isLoading?: boolean;
  as?: "button" | "span" | "div";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "secondary",
  size = "normal",
  icon,
  className,
  isLoading = false,
  as,
  ...props
}) => {
  const disabled = props.disabled || isLoading;

  // For non-button elements, render directly (asChild doesn't work with arbitrary elements)
  if (as && as !== "button") {
    const Component = as as React.ElementType;
    return (
      <Component
        className={cn(
          "font-black rounded-xl uppercase tracking-wide antialiased inline-flex items-center justify-center gap-2 space-x-2 disabled:opacity-30 disabled:cursor-not-allowed",
          sizeClasses[size],
          className
        )}
      >
        {isLoading ? (
          <Loader className={iconSizeClasses[size]} />
        ) : (
          icon && <Icon name={icon} className={iconSizeClasses[size]} />
        )}
        <span>{children}</span>
      </Component>
    );
  }

  return (
    <ShadcnButton
      variant={variantMap[variant]}
      className={cn(
        "font-black rounded-xl uppercase tracking-wide antialiased space-x-2 disabled:opacity-30 disabled:cursor-not-allowed",
        sizeClasses[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {isLoading ? (
        <Loader className={iconSizeClasses[size]} />
      ) : (
        icon && <Icon name={icon} className={iconSizeClasses[size]} />
      )}
      <span>{children}</span>
    </ShadcnButton>
  );
};
