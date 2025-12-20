import type { ScheduledPost } from '../types';

const DB_NAME = 'DirectorAi_DB';
const STORE_SCHEDULED = 'scheduled_posts';
const DB_VERSION = 2;

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create scheduled posts store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_SCHEDULED)) {
        const store = db.createObjectStore(STORE_SCHEDULED, { keyPath: 'id' });
        store.createIndex('by_date', 'scheduledDate', { unique: false });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_timestamp', 'scheduledTimestamp', { unique: false });
      }
    };
  });
};

// Generate unique ID
const generateId = (): string => {
  return `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Save a new scheduled post
export const saveScheduledPost = async (
  post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ScheduledPost> => {
  const db = await initDB();
  const now = Date.now();

  const newPost: ScheduledPost = {
    ...post,
    id: generateId(),
    createdAt: now,
    updatedAt: now
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SCHEDULED, 'readwrite');
    const store = transaction.objectStore(STORE_SCHEDULED);
    const request = store.add(newPost);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(newPost);
  });
};

// Update an existing scheduled post
export const updateScheduledPost = async (
  postId: string,
  updates: Partial<ScheduledPost>
): Promise<ScheduledPost | null> => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SCHEDULED, 'readwrite');
    const store = transaction.objectStore(STORE_SCHEDULED);

    const getRequest = store.get(postId);

    getRequest.onerror = () => reject(getRequest.error);
    getRequest.onsuccess = () => {
      const existingPost = getRequest.result as ScheduledPost | undefined;

      if (!existingPost) {
        resolve(null);
        return;
      }

      const updatedPost: ScheduledPost = {
        ...existingPost,
        ...updates,
        id: postId, // Ensure ID doesn't change
        updatedAt: Date.now()
      };

      const putRequest = store.put(updatedPost);
      putRequest.onerror = () => reject(putRequest.error);
      putRequest.onsuccess = () => resolve(updatedPost);
    };
  });
};

// Delete a scheduled post
export const deleteScheduledPost = async (postId: string): Promise<boolean> => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SCHEDULED, 'readwrite');
    const store = transaction.objectStore(STORE_SCHEDULED);
    const request = store.delete(postId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(true);
  });
};

// Load all scheduled posts
export const loadScheduledPosts = async (): Promise<ScheduledPost[]> => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SCHEDULED, 'readonly');
    const store = transaction.objectStore(STORE_SCHEDULED);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const posts = request.result as ScheduledPost[];
      // Sort by scheduled timestamp
      posts.sort((a, b) => a.scheduledTimestamp - b.scheduledTimestamp);
      resolve(posts);
    };
  });
};

// Load posts for a specific date range
export const loadScheduledPostsByDateRange = async (
  startDate: string,
  endDate: string
): Promise<ScheduledPost[]> => {
  const allPosts = await loadScheduledPosts();
  return allPosts.filter(post =>
    post.scheduledDate >= startDate && post.scheduledDate <= endDate
  );
};

// Load posts by status
export const loadScheduledPostsByStatus = async (
  status: ScheduledPost['status']
): Promise<ScheduledPost[]> => {
  const allPosts = await loadScheduledPosts();
  return allPosts.filter(post => post.status === status);
};

// Get upcoming posts (for notifications/reminders)
export const getUpcomingPosts = async (hoursAhead: number = 1): Promise<ScheduledPost[]> => {
  const now = Date.now();
  const futureLimit = now + (hoursAhead * 60 * 60 * 1000);

  const allPosts = await loadScheduledPosts();
  return allPosts.filter(post =>
    post.status === 'scheduled' &&
    post.scheduledTimestamp >= now &&
    post.scheduledTimestamp <= futureLimit
  );
};

// Get overdue posts (scheduled time has passed but not published)
export const getOverduePosts = async (): Promise<ScheduledPost[]> => {
  const now = Date.now();

  const allPosts = await loadScheduledPosts();
  return allPosts.filter(post =>
    post.status === 'scheduled' &&
    post.scheduledTimestamp < now
  );
};
