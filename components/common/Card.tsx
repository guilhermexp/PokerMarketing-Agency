import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-surface/50 backdrop-blur-lg border border-muted/50 rounded-xl ${className}`}>
      {children}
    </div>
  );
};