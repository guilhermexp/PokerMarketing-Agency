import { fetchApi } from "./base";

export interface DbGalleryImage {
  id: string;
  user_id: string;
  src_url: string;
  thumbnail_url?: string | null;
  prompt: string | null;
  source: string;
  model: string;
  aspect_ratio: string | null;
  image_size: string | null;
  created_at: string;
  published_at?: string | null;
  media_type?: string | null;
  duration?: number | null;
  post_id?: string | null;
  ad_creative_id?: string | null;
  video_script_id?: string | null;
  is_style_reference?: boolean | null;
  style_reference_name?: string | null;
  week_schedule_id?: string | null;
  daily_flyer_day?: string | null;
  daily_flyer_period?: string | null;
}

export async function getGalleryImages(
  userId: string,
  organizationId?: string | null,
  options?: { source?: string; limit?: number },
): Promise<DbGalleryImage[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);
  if (options?.source) params.append("source", options.source);
  if (options?.limit) params.append("limit", String(options.limit));

  return fetchApi<DbGalleryImage[]>(`/gallery?${params}`);
}

export async function createGalleryImage(
  userId: string,
  data: {
    src_url: string;
    prompt?: string;
    source: string;
    model: string;
    aspect_ratio?: string;
    image_size?: string;
    post_id?: string;
    ad_creative_id?: string;
    video_script_id?: string;
    organization_id?: string | null;
    media_type?: string;
    duration?: number;
    week_schedule_id?: string | null;
    daily_flyer_day?: string | null;
    daily_flyer_period?: string | null;
  },
): Promise<DbGalleryImage> {
  return fetchApi<DbGalleryImage>("/gallery", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function getDailyFlyers(
  userId: string,
  weekScheduleId: string,
  organizationId?: string | null,
): Promise<{
  images: DbGalleryImage[];
  structured: Record<string, Record<string, DbGalleryImage[]>>;
}> {
  const params = new URLSearchParams({
    user_id: userId,
    week_schedule_id: weekScheduleId,
  });
  if (organizationId) {
    params.append("organization_id", organizationId);
  }

  return fetchApi(`/gallery/daily-flyers?${params}`);
}

export async function deleteGalleryImage(id: string): Promise<void> {
  await fetchApi(`/gallery?id=${id}`, { method: "DELETE" });
}

export async function updateGalleryImage(
  id: string,
  data: Partial<DbGalleryImage>,
): Promise<DbGalleryImage | null> {
  if (id.startsWith("temp-")) {
    return null;
  }

  return fetchApi<DbGalleryImage>(`/gallery?id=${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function markGalleryImagePublished(
  id: string,
): Promise<DbGalleryImage | null> {
  return updateGalleryImage(id, { published_at: new Date().toISOString() });
}
