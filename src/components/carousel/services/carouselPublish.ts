/**
 * Carousel publish helper
 */

import type { Dispatch, SetStateAction } from 'react';
import type { GalleryImage } from '../../../types';

interface PublishParams {
  clipKey: string;
  images: GalleryImage[];
  title: string;
  captions: Record<string, string>;
  onPublishCarousel?: (imageUrls: string[], caption: string) => Promise<void>;
  setPublishing: Dispatch<SetStateAction<Record<string, boolean>>>;
}

export const publishCarousel = async ({
  clipKey,
  images,
  title,
  captions,
  onPublishCarousel,
  setPublishing,
}: PublishParams) => {
  if (!onPublishCarousel || images.length < 2) return;

  setPublishing((prev) => ({ ...prev, [clipKey]: true }));
  try {
    const imageUrls = images.map((img) => img.src);
    const caption = captions[clipKey] || title;
    await onPublishCarousel(imageUrls, caption);
  } catch (err) {
    console.error('[CarrosselTab] Failed to publish carousel:', err);
  } finally {
    setPublishing((prev) => ({ ...prev, [clipKey]: false }));
  }
};
