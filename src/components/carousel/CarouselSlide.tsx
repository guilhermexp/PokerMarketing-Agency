/**
 * CarouselSlide
 */

import React from 'react';
import { CarouselSlideEditor } from './CarouselSlideEditor';

interface CarouselSlideProps {
  index: number;
}

export const CarouselSlide: React.FC<CarouselSlideProps> = ({ index }) => (
  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
    <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">
      Slide {index}
    </div>
    <CarouselSlideEditor />
  </div>
);
