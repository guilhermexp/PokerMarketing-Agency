import React from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { Loader } from "./Loader";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  size?: "normal" | "large" | "small";
  icon?: IconName;
  isLoading?: boolean;
  as?: "button" | "span" | "div";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "secondary",
  size = "normal",
  icon,
  className = "",
  isLoading = false,
  as = "button",
  ...props
}) => {
  const baseClasses =
    "font-black rounded-xl transition-all focus:outline-none flex items-center justify-center space-x-2 disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wide antialiased";

  const variantClasses = {
    primary: "bg-primary text-black hover:bg-primary/90 active:scale-95",
    secondary: "bg-white text-black hover:bg-white/90 active:scale-95",
  };

  const sizeClasses = {
    normal: "px-5 py-2.5 text-[10px]",
    large: "px-6 py-3 text-sm",
    small: "px-4 py-2.5 text-[10px]",
  };

  const iconSizeClasses = {
    normal: "w-4 h-4",
    large: "w-5 h-5",
    small: "w-3.5 h-3.5",
  };

  const finalProps = { ...props, disabled: props.disabled || isLoading };
  const Component = as as React.ElementType;

  return (
    <Component
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...(as === "button" ? finalProps : {})}
    >
      {isLoading ? (
        <Loader className={iconSizeClasses[size]} />
      ) : (
        icon && <Icon name={icon} className={iconSizeClasses[size]} />
      )}
      <span>{children}</span>
    </Component>
  );
};
