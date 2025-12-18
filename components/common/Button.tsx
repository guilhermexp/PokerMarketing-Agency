
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
  const baseClasses = 'font-bold rounded-full transition-all duration-300 focus:outline-none flex items-center justify-center space-x-2 disabled:opacity-30 disabled:cursor-not-allowed tracking-tight antialiased';
  
  const variantClasses = {
    primary: 'bg-gradient-to-r from-primary to-primary-hover text-black hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_rgba(245,158,11,0.2)]',
    secondary: 'bg-[#1A1A1A] text-white border border-[#2A2A2A] hover:bg-[#222] hover:border-[#333] active:scale-[0.98]',
  };

  const sizeClasses = {
      normal: 'px-6 py-2.5 text-xs',
      large: 'px-10 py-4 text-sm', 
      small: 'px-4 py-2 text-[10px]',
  }
  
  const iconSizeClasses = {
      normal: 'w-4 h-4',
      large: 'w-5 h-5',
      small: 'w-3.5 h-3.5',
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
      <span>{children}</span>
    </button>
  );
};
