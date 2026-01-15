/**
 * Scheduler API - Scheduled posts operations
 */

import {
  getScheduledPosts,
  createScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
  type DbScheduledPost,
} from './dbApi';

export const schedulerApi = {
  getScheduledPosts,
  createScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
};

export {
  getScheduledPosts,
  createScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
  type DbScheduledPost,
};
