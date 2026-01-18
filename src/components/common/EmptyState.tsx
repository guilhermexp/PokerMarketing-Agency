import React from "react";
import { Icon, type IconName } from "./Icon";
import { Button } from "./Button";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description: string;
  subtitle?: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  secondaryActionLabel?: string;
  secondaryActionIcon?: IconName;
  onSecondaryAction?: () => void;
  size?: "small" | "medium" | "large";
  children?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  subtitle,
  actionLabel,
  actionIcon = "plus",
  onAction,
  secondaryActionLabel,
  secondaryActionIcon,
  onSecondaryAction,
  size = "medium",
  children,
  className = "",
}) => {
  const sizeClasses = {
    small: {
      container: "p-8 md:p-10",
      iconWrapper: "w-14 h-14 rounded-xl",
      icon: "w-6 h-6",
      title: "text-base",
      description: "text-xs",
      blur: "w-[300px] h-[300px]",
    },
    medium: {
      container: "p-10 md:p-14",
      iconWrapper: "w-16 h-16 rounded-2xl",
      icon: "w-7 h-7",
      title: "text-lg",
      description: "text-sm",
      blur: "w-[400px] h-[400px]",
    },
    large: {
      container: "p-12 md:p-16",
      iconWrapper: "w-20 h-20 rounded-2xl",
      icon: "w-8 h-8",
      title: "text-xl",
      description: "text-sm",
      blur: "w-[500px] h-[500px]",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div
      className={`
        relative overflow-hidden
        bg-gradient-to-b from-[#0d0d0d] to-[#080808]
        rounded-3xl border border-white/[0.04]
        ${classes.container}
        text-center
        ${className}
      `}
      style={{ animation: "fadeSlideIn 0.6s ease-out" }}
    >
      {/* Icon */}
      <div className="relative inline-flex items-center justify-center mb-6">
        <div
          className={`relative ${classes.iconWrapper} bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/[0.08] flex items-center justify-center`}
        >
          <Icon name={icon} className={`${classes.icon} text-white/20`} />
        </div>
      </div>

      {/* Text */}
      <h3 className={`relative ${classes.title} font-bold text-white mb-2`}>
        {title}
      </h3>
      <p
        className={`relative ${classes.description} text-white/30 max-w-sm mx-auto mb-8 leading-relaxed`}
      >
        {description}
      </p>

      {/* Actions */}
      {children ? (
        <div className="relative flex flex-col items-center gap-3">
          {children}
        </div>
      ) : (
        (onAction || onSecondaryAction) && (
          <div className="relative flex flex-wrap items-center justify-center gap-3">
            {onAction && actionLabel && (
              <Button
                onClick={onAction}
                variant="primary"
                icon={actionIcon}
                size={size === "small" ? "small" : "large"}
              >
                {actionLabel}
              </Button>
            )}
            {onSecondaryAction && secondaryActionLabel && (
              <Button
                onClick={onSecondaryAction}
                variant="secondary"
                icon={secondaryActionIcon}
                size={size === "small" ? "small" : "large"}
              >
                {secondaryActionLabel}
              </Button>
            )}
          </div>
        )
      )}

      {/* Subtitle */}
      {subtitle && (
        <p className="relative text-[10px] text-white/20 uppercase tracking-wider mt-6">
          {subtitle}
        </p>
      )}

      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
