import React from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Loader } from './Loader';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'normal' | 'large' | 'small';
  icon?: IconName;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'normal',
  icon,
  className = '',
  isLoading = false,
  ...props
}) => {
  const baseClasses = 'font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md';
  
  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-primary-hover focus:ring-primary',
    secondary: 'bg-surface/50 text-text-main hover:bg-surface/80 focus:ring-primary border border-muted/60 backdrop-blur-sm',
  };

  const sizeClasses = {
      normal: 'px-4 py-2 text-sm',
      large: 'px-5 py-2.5 text-base', // Refined size
      small: 'px-3 py-1.5 text-xs',
  }
  
  const iconSizeClasses = {
      normal: 'w-4 h-4',
      large: 'w-5 h-5',
      small: 'w-4 h-4',
  };

  const finalProps = { ...props, disabled: props.disabled || isLoading };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...finalProps}
    >
      {isLoading ? (
        <Loader className={iconSizeClasses[size]} />
      ) : (
        icon && <Icon name={icon} className={iconSizeClasses[size]}/>
      )}
      {children}
    </button>
  );
};