# Daily Flyers Database Persistence

## Overview

Daily flyers (tournament flyers generated per day/period) are now persisted in the database instead of localStorage. This ensures all users in an organization see the same flyers when they access the flyers page.

## Database Schema

Flyers are stored in the `gallery_images` table with three additional columns:

```sql
-- Added via migration 014_add_daily_flyer_day.sql
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS daily_flyer_day VARCHAR(20);
-- week_schedule_id and daily_flyer_period were added in migration 013

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_gallery_images_daily_flyers
  ON gallery_images(week_schedule_id, daily_flyer_day, daily_flyer_period)
  WHERE week_schedule_id IS NOT NULL;
```

| Column | Type | Description |
|--------|------|-------------|
| `week_schedule_id` | UUID | Links flyer to a specific week schedule |
| `daily_flyer_day` | VARCHAR(20) | Day of week (e.g., "SUNDAY", "MONDAY") |
| `daily_flyer_period` | VARCHAR(20) | Time period ("MORNING", "AFTERNOON", "NIGHT", "HIGHLIGHTS") |

## API Endpoints

### GET `/api/db/gallery/daily-flyers`

Fetches all flyers for a specific week schedule.

**Query Parameters:**
- `user_id` (required): Clerk user ID
- `week_schedule_id` (required): UUID of the week schedule
- `organization_id` (optional): Organization context

**Response:**
```json
{
  "images": [...],  // Flat array of all flyer images
  "structured": {   // Organized by day and period
    "SUNDAY": {
      "MORNING": [...],
      "AFTERNOON": [...],
      "NIGHT": [...]
    }
  }
}
```

### POST `/api/db/gallery`

Creates a new gallery image. For daily flyers, include:

```json
{
  "user_id": "user_xxx",
  "src_url": "https://...",
  "source": "Flyer Diário",
  "week_schedule_id": "uuid",
  "daily_flyer_day": "SUNDAY",
  "daily_flyer_period": "MORNING"
}
```

## Frontend Architecture

### State Management

Daily flyer state is managed in `App.tsx`:

```typescript
const [dailyFlyerState, setDailyFlyerState] = useState<
  Record<string, Record<TimePeriod, (GalleryImage | "loading")[]>>
>({});
```

Structure: `{ DAY: { PERIOD: [flyers] } }`

### Loading Flow

1. **Page Load**: `swrAllSchedules` is fetched via `/api/db/init`

2. **Auto-Load Schedule**: When schedules are available and no current schedule is selected:
   ```typescript
   // App.tsx - Auto-load effect
   useEffect(() => {
     if (!hasAutoLoadedScheduleRef.current && swrAllSchedules?.length > 0 && !currentScheduleId && userId) {
       hasAutoLoadedScheduleRef.current = true;
       handleSelectSchedule(swrAllSchedules[0]);
     }
   }, [swrAllSchedules, currentScheduleId, userId]);
   ```

3. **Load Daily Flyers**: When `currentScheduleId` is set:
   ```typescript
   // App.tsx - Daily flyers loading effect
   useEffect(() => {
     if (!userId || !currentScheduleId) return;

     const result = await getDailyFlyers(userId, currentScheduleId, organizationId);
     // Merge with existing state (preserves any in-progress generations)
     setDailyFlyerState(prev => merge(prev, result.structured));
   }, [userId, currentScheduleId, organizationId]);
   ```

4. **Saving Flyers**: When a flyer is generated, `PeriodCardRow.tsx` calls:
   ```typescript
   onAddImageToGallery({
     src: imageUrl,
     source: "Flyer Diário",
     week_schedule_id: currentScheduleId,
     daily_flyer_day: selectedDay,      // e.g., "SUNDAY"
     daily_flyer_period: period,        // e.g., "MORNING"
   });
   ```

### Schedule Switching

When switching between schedules, state is only cleared if actually changing to a **different** schedule:

```typescript
// App.tsx - handleSelectSchedule
const isSwitchingSchedule = currentScheduleId && currentScheduleId !== schedule.id;
if (isSwitchingSchedule) {
  setDailyFlyerState({});
  hasRestoredDailyFlyersRef.current = false;
}
```

This prevents accidental state clearing on component remounts or duplicate calls.

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | State management, loading effects, save handlers |
| `src/components/flyer/PeriodCardRow.tsx` | Flyer generation UI, passes day/period on save |
| `src/services/apiClient.ts` | `getDailyFlyers()`, `createGalleryImage()` functions |
| `server/dev-api.mjs` | API endpoint handlers |
| `db/migrations/014_add_daily_flyer_day.sql` | Database migration |

## Migration from localStorage

Previously, daily flyers were stored in `localStorage.dailyFlyerState`. This had issues:
- Not shared between users/devices
- Lost on browser data clear
- No organization-level sharing

The new database-backed approach:
- Persists across sessions
- Shared within organizations
- Survives browser data clear
- Proper multi-tenant support

## Debugging

Console logs are available for debugging:

```
🔄 [AutoLoad] Loading most recent schedule: {scheduleId}
🔄 [DailyFlyers] useEffect triggered: {userId, currentScheduleId, ...}
📥 [DailyFlyers] Loading from database: {...}
📦 [DailyFlyers] Result: {imagesCount, structuredKeys}
✅ [DailyFlyers] Merged state from database: [days]
🔄 [handleSelectSchedule] Switching schedules, clearing flyer state
```

To check database data directly:
```sql
SELECT id, daily_flyer_day, daily_flyer_period, week_schedule_id, created_at
FROM gallery_images
WHERE week_schedule_id IS NOT NULL
ORDER BY created_at DESC;
```
