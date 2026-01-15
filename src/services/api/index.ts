/**
 * API Services - Barrel Export
 *
 * Re-exports all API modules for easy importing.
 * This maintains backwards compatibility with existing apiClient.ts imports.
 *
 * Usage:
 * - Direct import: import { getInitialData } from '@/services/api';
 * - Domain import: import { dbApi } from '@/services/api';
 */

// =============================================================================
// Client Base (utility functions)
// =============================================================================

export { fetchApi, fetchAiApi, getVideoDisplayUrl, API_BASE, AI_API_BASE } from './client';

// =============================================================================
// Database API (User, Brand, Gallery, Scheduled Posts)
// =============================================================================

export {
  // Initial data
  getInitialData,
  type InitialData,
  // User
  getOrCreateUser,
  getUserByEmail,
  type DbUser,
  // Brand Profile
  getBrandProfile,
  createBrandProfile,
  updateBrandProfile,
  type DbBrandProfile,
  // Gallery
  getGalleryImages,
  createGalleryImage,
  deleteGalleryImage,
  updateGalleryImage,
  markGalleryImagePublished,
  type DbGalleryImage,
  // Scheduled Posts
  getScheduledPosts,
  createScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
  type DbScheduledPost,
  // Health
  checkDatabaseHealth,
} from './dbApi';

// =============================================================================
// Campaigns API (Campaigns, Posts, Ads, Carousels)
// =============================================================================

export {
  // Campaigns
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  type DbCampaign,
  type DbCampaignFull,
  // Video Clip Scripts
  updateClipThumbnail,
  updateSceneImage,
  type DbVideoClipScript,
  // Posts
  updatePostImage,
  type DbPost,
  // Ad Creatives
  updateAdCreativeImage,
  type DbAdCreative,
  // Carousels
  updateCarouselCover,
  updateCarouselSlideImage,
  updateCarouselCaption,
  type DbCarouselScript,
} from './campaignsApi';

// =============================================================================
// Tournament API (Schedules, Events, Flyers)
// =============================================================================

export {
  // Tournament Data
  getTournamentData,
  getWeekSchedulesList,
  getScheduleEvents,
  createWeekSchedule,
  deleteWeekSchedule,
  type TournamentData,
  type DbWeekSchedule,
  type DbTournamentEvent,
  type WeekScheduleWithCount,
  // Flyers
  addEventFlyer,
  removeEventFlyer,
  addDailyFlyer,
  removeDailyFlyer,
} from './tournamentApi';

// =============================================================================
// Upload API (Vercel Blob)
// =============================================================================

export {
  uploadToBlob,
  uploadVideo,
  uploadAudio,
  uploadImage,
  type UploadResult,
} from './uploadApi';

// =============================================================================
// Jobs API (Background Generation)
// =============================================================================

export {
  // Queue
  queueGenerationJob,
  queueVideoJob,
  queueImageJob,
  // Status
  getGenerationJobStatus,
  getGenerationJobs,
  pollGenerationJob,
  // Cancel
  cancelGenerationJob,
  cancelAllGenerationJobs,
  // Types
  type GenerationJob,
  type GenerationJobConfig,
  type VideoJobConfig,
  type ImageJobConfig,
  type QueueJobResult,
  type JobType,
} from './jobsApi';

// =============================================================================
// AI API (Generation)
// =============================================================================

export {
  // Image
  generateAiImage,
  generateAiFlyer,
  editAiImage,
  // Speech
  generateAiSpeech,
  // Text
  generateAiText,
  // Campaign
  generateAiCampaign,
  // Video
  generateVideo,
  // Types
  type AiBrandProfile,
  type AiImageFile,
  type AiGenerationResult,
  type AiCampaign,
  type AiGenerationOptions,
  type ApiVideoModel,
  type VideoGenerationResult,
} from './aiApi';

// =============================================================================
// Version
// =============================================================================

export const API_VERSION = '1.0.0';
