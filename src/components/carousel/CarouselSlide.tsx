/**
 * CarouselSlide
 */

import React from 'react';
import { CarouselSlideEditor } from './CarouselSlideEditor';

interface CarouselSlideProps {
  index: number;
}

export const CarouselSlide: React.FC<CarouselSlideProps> = ({ index }) => (
  <div className="rounded-xl border border-border bg-black/30 p-3">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
      Slide {index}
    </div>
    <CarouselSlideEditor />
  </div>
);
