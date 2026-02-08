import { useMemo } from "react"
import { SocialStories, type Story } from "./social-stories"
import type { ScheduledPost } from "@/types"

interface PublishedStoriesWidgetProps {
  scheduledPosts: ScheduledPost[]
  brandProfile: {
    name: string
    logo: string | null
  }
}

const getPlatformName = (
  platform: ScheduledPost["platforms"]
): "instagram" | "linkedin" | "twitter" | "facebook" => {
  if (platform === "both") return "instagram"
  return platform
}

export function PublishedStoriesWidget({
  scheduledPosts,
  brandProfile,
}: PublishedStoriesWidgetProps) {
  // Filter only published posts from today and convert to stories
  const stories = useMemo<Story[]>(() => {
    // Get today's date at midnight (start of day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTimestamp = today.getTime()

    // Get tomorrow's date at midnight (end of today)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowTimestamp = tomorrow.getTime()

    return scheduledPosts
      .filter((post) => {
        // Must be published (not just scheduled)
        if (post.status !== "published" || !post.publishedAt) {
          return false
        }

        // Must be published today
        const publishedAt = post.publishedAt
        return publishedAt >= todayTimestamp && publishedAt < tomorrowTimestamp
      })
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)) // Most recent first
      .slice(0, 20) // Limit to 20 stories
      .map((post) => ({
        id: post.id,
        platform: getPlatformName(post.platforms),
        mediaUrl: post.imageUrl,
        linkUrl: post.instagramMediaId
          ? `https://www.instagram.com/p/${post.instagramMediaId}/`
          : undefined,
        caption: post.caption,
        duration: 7, // 7 seconds per story
        scheduledPost: post,
      }))
  }, [scheduledPosts])

  // Get brand profile info
  const profile = useMemo(
    () => ({
      name: brandProfile.name,
      avatarUrl:
        brandProfile.logo ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(brandProfile.name)}&background=random&size=128`,
    }),
    [brandProfile]
  )

  // Don't render if no published posts
  if (stories.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-20 right-6 sm:bottom-6 z-50">
      <SocialStories stories={stories} profile={profile} defaultDuration={7} />
    </div>
  )
}
