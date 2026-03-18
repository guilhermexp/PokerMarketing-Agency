import { fetchApi } from "./base";

export interface DbScheduledPost {
  id: string;
  user_id: string;
  content_type: string;
  content_id: string | null;
  image_url: string;
  carousel_image_urls?: string[] | null;
  caption: string;
  hashtags: string[];
  scheduled_date: string;
  scheduled_time: string;
  scheduled_timestamp: string;
  timezone: string;
  platforms: string;
  instagram_content_type: string | null;
  status: string;
  published_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at?: string;
  created_from?: string;
  instagram_media_id?: string;
  instagram_container_id?: string;
  publish_attempts?: number;
  last_publish_attempt?: string;
  instagram_account_id?: string | null;
}

export async function getScheduledPosts(
  userId: string,
  organizationId?: string | null,
  options?: { status?: string; startDate?: string; endDate?: string },
): Promise<DbScheduledPost[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);
  if (options?.status) params.append("status", options.status);
  if (options?.startDate) params.append("start_date", options.startDate);
  if (options?.endDate) params.append("end_date", options.endDate);

  return fetchApi<DbScheduledPost[]>(`/scheduled-posts?${params}`);
}

export async function createScheduledPost(
  userId: string,
  data: {
    content_type: string;
    content_id?: string;
    image_url: string;
    carousel_image_urls?: string[];
    caption: string;
    hashtags: string[];
    scheduled_date: string;
    scheduled_time: string;
    scheduled_timestamp: string;
    timezone: string;
    platforms: string;
    instagram_content_type?: string;
    instagram_account_id?: string;
    created_from?: string;
    organization_id?: string | null;
  },
): Promise<DbScheduledPost> {
  return fetchApi<DbScheduledPost>("/scheduled-posts", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateScheduledPost(
  id: string,
  data: Partial<DbScheduledPost>,
): Promise<DbScheduledPost> {
  return fetchApi<DbScheduledPost>(`/scheduled-posts?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteScheduledPost(id: string): Promise<void> {
  await fetchApi(`/scheduled-posts?id=${id}`, { method: "DELETE" });
}

export async function retryScheduledPost(
  id: string,
  userId: string,
): Promise<DbScheduledPost> {
  return fetchApi<DbScheduledPost>("/scheduled-posts/retry", {
    method: "POST",
    body: JSON.stringify({ id, user_id: userId }),
  });
}
