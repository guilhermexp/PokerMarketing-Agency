/**
 * Carousel types (placeholder)
 */

export interface CarouselSlide {
  id: string;
  imageUrl?: string;
  caption?: string;
}

export interface CarouselScript {
  id: string;
  title?: string;
  slides: CarouselSlide[];
}
