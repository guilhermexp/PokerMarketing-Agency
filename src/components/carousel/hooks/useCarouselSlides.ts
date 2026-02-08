/**
 * useCarouselSlides
 */

import { useState } from 'react';

export const useCarouselSlides = () => {
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);

  return {
    activeSlideId,
    setActiveSlideId,
  };
};
