import React from 'react';

// FIX: Define and export IconName type to be used across the application.
export type IconName =
  | 'logo'
  | 'zap'
  | 'image'
  | 'clock'
  | 'edit'
  | 'share'
  | 'upload'
  | 'arrowRight'
  | 'x'
  // FIX: Add new icons for FlyerGenerator and ImagePreviewModal
  | 'dollar-sign'
  | 'trophy'
  | 'users'
  | 'chevron-up'
  | 'chevron-down'
  | 'calendar'
  | 'globe'
  | 'search'
  | 'download'
  // Assistant Icon
  | 'bot'
  | 'send'
  // Theme Icons
  | 'sun'
  | 'moon';

interface IconProps {
  name: IconName;
  className?: string;
}

const iconPaths: Record<IconName, React.ReactNode> = {
  logo: (
    <>
      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
      <path d="M2 17l10 5 10-5"></path>
      <path d="M2 12l10 5 10-5"></path>
    </>
  ),
  zap: (
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <polyline points="21 15 16 10 5 21"></polyline>
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </>
  ),
  edit: (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </>
  ),
  share: (
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
      <polyline points="16 6 12 2 8 6"></polyline>
      <line x1="12" y1="2" x2="12" y2="15"></line>
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
    </>
  ),
  arrowRight: (
    <>
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <polyline points="12 5 19 12 12 19"></polyline>
    </>
  ),
  x: (
    <>
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </>
  ),
  'dollar-sign': (
    <>
      <line x1="12" y1="1" x2="12" y2="23"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
    </>
  ),
  trophy: (
    <>
      <path d="M9 11.75A2.75 2.75 0 0 1 12 9h0a2.75 2.75 0 0 1 3 2.75l-1.5 7.5a2 2 0 0 1-2 1.75h-1a2 2 0 0 1-2-1.75Z"></path>
      <path d="M10.5 5h3"></path>
      <path d="M12 5V2"></path>
      <path d="M6 10s.5-1 2-1h8c1.5 0 2 1 2 1"></path>
      <path d="M6 19a2 2 0 0 0-2 2v1h16v-1a2 2 0 0 0-2-2"></path>
    </>
  ),
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </>
  ),
  'chevron-up': <polyline points="18 15 12 9 6 15"></polyline>,
  'chevron-down': <polyline points="6 9 12 15 18 9"></polyline>,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </>
  ),
  bot: (
      <>
        <path d="M12 8V4H8" />
        <rect width="16" height="12" x="4" y="8" rx="2" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <path d="M15 13v2" />
        <path d="M9 13v2" />
      </>
  ),
  send: (
      <line x1="22" y1="2" x2="11" y2="13"></line>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </>
  ),
  moon: (
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  ),
};

// FIX: Implement the Icon component to render SVGs. This resolves errors where Icon.tsx was not a module.
export const Icon: React.FC<IconProps> = ({ name, className }) => {
  return (
    <svg 
      className={className} 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  );
};
