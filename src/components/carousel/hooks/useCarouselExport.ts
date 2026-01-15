/**
 * useCarouselExport
 */

import { useState } from 'react';

export const useCarouselExport = () => {
  const [isExporting, setIsExporting] = useState(false);

  return {
    isExporting,
    setIsExporting,
  };
};
