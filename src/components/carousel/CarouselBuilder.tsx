/**
 * CarouselBuilder
 */

import React from 'react';
import { CarouselSlide } from './CarouselSlide';

export const CarouselBuilder: React.FC = () => (
  <section className="rounded-xl border border-border bg-background p-4">
    <h2 className="text-xs font-black text-white/70 uppercase tracking-widest mb-4">
      Construtor
    </h2>
    <div className="space-y-3">
      {[1, 2, 3].map((index) => (
        <CarouselSlide key={index} index={index} />
      ))}
    </div>
  </section>
);
