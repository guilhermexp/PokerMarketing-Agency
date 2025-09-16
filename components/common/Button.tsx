import React from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'normal' | 'large' | 'small';
  icon?: IconName;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'normal',
  icon,
  className = '',
  ...props
}) => {
  const baseClasses = 'font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg';
  
  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-primary-hover focus:ring-primary',
    secondary: 'bg-surface/50 text-text-main hover:bg-surface/80 focus:ring-primary border border-muted/60 backdrop-blur-sm',
  };

  const sizeClasses = {
      normal: 'px-4 py-2 text-sm',
      large: 'px-6 py-3 text-base',
      small: 'px-3 py-1.5 text-xs',
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} className="w-4 h-4"/>}
      <span>{children}</span>
    </button>
  );
};