/**
 * Gallery API - Gallery image operations
 */

import {
  getGalleryImages,
  createGalleryImage,
  deleteGalleryImage,
  updateGalleryImage,
  markGalleryImagePublished,
  type DbGalleryImage,
} from './dbApi';

export const galleryApi = {
  getGalleryImages,
  createGalleryImage,
  deleteGalleryImage,
  updateGalleryImage,
  markGalleryImagePublished,
};

export {
  getGalleryImages,
  createGalleryImage,
  deleteGalleryImage,
  updateGalleryImage,
  markGalleryImagePublished,
  type DbGalleryImage,
};
