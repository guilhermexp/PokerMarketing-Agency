/**
 * CarouselReorder
 */

import React from 'react';

export const CarouselReorder: React.FC = () => (
  <section className="rounded-xl border border-border bg-background p-4">
    <h2 className="text-xs font-black text-white/70 uppercase tracking-widest mb-3">
      Reordenar
    </h2>
    <div className="text-[10px] text-muted-foreground">
      Arraste os slides para reordenar.
    </div>
  </section>
);
