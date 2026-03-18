import { fetchApi } from "./base";
import {
  DbCampaignFull,
  DbCarouselScript,
  getCampaignById,
  getCampaigns,
} from "./campaignApi";

export interface DbCarouselListItem {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  title: string;
  hook: string;
  cover_prompt: string | null;
  cover_url: string | null;
  caption: string | null;
  gallery_images: string[];
  slides: Array<{ slide: number; visual: string; text: string; image_url?: string }>;
  slides_count: number;
  created_at: string;
  updated_at: string;
}

function mapFallbackCarousels(campaigns: Array<DbCampaignFull | null>): DbCarouselListItem[] {
  const items: DbCarouselListItem[] = [];

  for (const campaign of campaigns) {
    if (!campaign?.carousel_scripts?.length) continue;
    for (const carousel of campaign.carousel_scripts) {
      items.push({
        id: carousel.id,
        campaign_id: carousel.campaign_id,
        campaign_name: campaign.name || null,
        title: carousel.title,
        hook: carousel.hook,
        cover_prompt: carousel.cover_prompt || null,
        cover_url: carousel.cover_url,
        caption: carousel.caption,
        gallery_images: [],
        slides: carousel.slides || [],
        slides_count: carousel.slides?.length || 0,
        created_at: carousel.created_at || campaign.created_at,
        updated_at: carousel.updated_at || campaign.updated_at,
      });
    }
  }

  return items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function getCarousels(
  userId: string,
  organizationId?: string | null,
): Promise<DbCarouselListItem[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);

  try {
    return await fetchApi<DbCarouselListItem[]>(`/carousels?${params}`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("HTTP 404")) {
      throw error;
    }
  }

  const campaigns = await getCampaigns(userId, organizationId);
  const fullCampaigns = await Promise.all(
    campaigns
      .filter((campaign) => (campaign.carousels_count || 0) > 0)
      .map((campaign) => getCampaignById(campaign.id, userId, organizationId)),
  );

  return mapFallbackCarousels(fullCampaigns);
}

export async function updateCarouselCover(
  carouselId: string,
  coverUrl: string,
): Promise<DbCarouselScript> {
  return fetchApi<DbCarouselScript>(`/carousels?id=${carouselId}`, {
    method: "PATCH",
    body: JSON.stringify({ cover_url: coverUrl }),
  });
}

export async function updateCarouselSlideImage(
  carouselId: string,
  slideNumber: number,
  imageUrl: string,
): Promise<DbCarouselScript> {
  return fetchApi<DbCarouselScript>(
    `/carousels/slide?carousel_id=${carouselId}&slide_number=${slideNumber}`,
    {
      method: "PATCH",
      body: JSON.stringify({ image_url: imageUrl }),
    },
  );
}

export async function updateCarouselCaption(
  carouselId: string,
  caption: string,
): Promise<DbCarouselScript> {
  return fetchApi<DbCarouselScript>(`/carousels?id=${carouselId}`, {
    method: "PATCH",
    body: JSON.stringify({ caption }),
  });
}
