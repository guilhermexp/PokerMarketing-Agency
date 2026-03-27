# SocialLab CLI

Standalone, agent-friendly CLI for the SocialLab API. It talks to the existing Express server over HTTP using the internal auth bypass headers.

## Quick Start

```bash
cd cli
npm install
npm run build
npm link
```

Set config with env vars or `~/.sociallabrc`:

```bash
sociallab config set url http://localhost:3002
sociallab config set token your-internal-token
sociallab config set user_id your-user-id
sociallab config set org_id your-org-id
```

Show the effective config:

```bash
sociallab config show
```

Environment variables:

- `SOCIALLAB_URL`
- `SOCIALLAB_TOKEN`
- `SOCIALLAB_USER_ID`
- `SOCIALLAB_ORG_ID`

Priority: env vars > `~/.sociallabrc` > defaults.

## Output

- Default: JSON to stdout
- `--pretty`: simple table output when possible
- `--quiet`: suppress stdout, rely on exit code

Examples:

```bash
sociallab campaigns list | jq
sociallab gallery list --pretty
sociallab admin usage --days 30 | jq '.totals'
```

## Commands

### Health & Config

```bash
sociallab health
sociallab db health
sociallab db init
sociallab config show
sociallab config set user_id user_123
```

### Campaigns

```bash
sociallab campaigns list --limit 20 --offset 0
sociallab campaigns get camp_123
sociallab campaigns create --transcript @transcript.txt --title "Friday Special"
sociallab campaigns update clip_123 --thumbnail-url https://cdn/thumb.png
sociallab campaigns update-scene clip_123 2 --image-url https://cdn/scene.png
sociallab campaigns delete camp_123
sociallab campaigns generate --transcript @meeting.txt --brand-profile @brand.json
```

### Gallery

```bash
sociallab gallery list --limit 50 --source cli
sociallab gallery get img_123
sociallab gallery add --url https://cdn/image.png --prompt "hero shot"
sociallab gallery update img_123 --published-at 2026-03-26T10:00:00.000Z
sociallab gallery delete img_123
sociallab gallery daily-flyers --week-schedule-id week_123
```

### Posts, Ads, Carousels

```bash
sociallab posts list --campaign-id camp_123
sociallab posts update post_123 --image-url https://cdn/post.png
sociallab ads list --campaign-id camp_123
sociallab ads update ad_123 --image-url https://cdn/ad.png
sociallab carousels list
sociallab carousels get car_123
sociallab carousels create --data @carousel.json
sociallab carousels update car_123 --cover-url https://cdn/cover.png
sociallab carousels update-slide car_123 3 --image-url https://cdn/slide.png
```

### Schedule, Brand, Instagram

```bash
sociallab schedule list --status scheduled
sociallab schedule create --image-url https://cdn/post.png --caption "Hoje" --scheduled-at 2026-03-26T18:00:00-03:00
sociallab schedule update sched_123 --status published --published-at 2026-03-26T21:00:00.000Z
sociallab schedule retry sched_123
sociallab brand list
sociallab brand create --name SocialLab --colors @colors.json
sociallab brand update brand_123 --logo-url https://cdn/logo.png
sociallab instagram list
sociallab instagram add --token rube_xxx
sociallab instagram update ig_123 --token rube_new
sociallab instagram delete ig_123
```

### Tournaments

```bash
sociallab tournaments list
sociallab tournaments list --week-schedule-id week_123
sociallab tournaments weeks
sociallab tournaments create --data @week-schedule.json
sociallab tournaments delete week_123
sociallab tournaments event-flyer event_123 --action add --url https://cdn/flyer.png
sociallab tournaments daily-flyer week_123 --period night --action set --urls @flyers.json
```

### AI

```bash
sociallab ai image --prompt "poker tournament poster" --aspect-ratio 9:16
sociallab ai edit-image --image-url https://cdn/image.png --prompt "remove background"
sociallab ai text --prompt "write a caption"
sociallab ai video --prompt "cinematic teaser" --model sora-2
sociallab ai flyer --data @flyer.json
sociallab ai speech --text "Bem-vindo ao torneio"
sociallab ai enhance --prompt "poster for poker night"
sociallab ai extract-colors --logo @logo.png
sociallab ai image-async --data @image-job.json
sociallab ai image-batch --data @image-batch.json
sociallab ai image-job-status job_123
sociallab ai image-jobs --limit 25
sociallab ai image-cancel job_123
```

### Playground

```bash
sociallab playground image topics
sociallab playground image create-topic --name "Flyers Abril"
sociallab playground image update-topic topic_123 --cover-url https://cdn/topic.png
sociallab playground image generate --topic-id topic_123 --prompt "luxury flyer" --count 4
sociallab playground image status gen_123
sociallab playground video topics
sociallab playground video create-topic --name "Teasers"
sociallab playground video generate --topic-id topic_123 --prompt "cinematic teaser"
sociallab playground video status topic_123
```

### Admin

```bash
sociallab admin stats
sociallab admin users --limit 50 --page 1
sociallab admin orgs --limit 50
sociallab admin usage --days 30 --group-by model
sociallab admin logs --severity error --limit 20
sociallab admin log log_123
sociallab admin suggest log_123
```

### Agent

```bash
sociallab agent chat --prompt "Gere ideias para flyer"
sociallab agent history --studio-type video --topic-id launch-week
sociallab agent reset --thread-id thread_123
sociallab agent files --query campaign --limit 10
sociallab agent search-content --type campaign --query festival
sociallab agent answer --thread-id thread_123 --interaction-id int_456 --answer "Sim"
```

### Upload

```bash
sociallab upload ./assets/banner.png
```

## Notes

- `@file` syntax works for text and JSON flags such as `--transcript`, `--data`, `--brand-profile`, `--options`.
- Commands use internal headers:
  - `X-Internal-Token`
  - `X-Internal-User-Id`
  - `X-Internal-Org-Id`
- `sociallab agent chat` streams SSE events as JSON lines.
- Some commands map to the current backend reality rather than older docs. When the backend no longer exposes a dedicated route, the CLI either uses the closest real route or fails with an explicit message.
