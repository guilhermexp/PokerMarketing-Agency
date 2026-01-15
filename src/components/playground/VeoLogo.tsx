/**
 * VeoLogo Component
 * SVG logo for Google Veo branding
 */

import React from 'react';

interface VeoLogoProps {
  className?: string;
}

export const VeoLogo: React.FC<VeoLogoProps> = ({ className }) => {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2L2 7l10 5 10-5-10-5z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M2 17l10 5 10-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default VeoLogo;
