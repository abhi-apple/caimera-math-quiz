# Caimera Quiz Frontend

Next.js UI for the competitive math quiz. Connects to the backend over HTTP + SSE.

## Setup

```bash
pnpm install
cp .env.local.example .env.local
```

Set `NEXT_PUBLIC_API_BASE` to your backend URL.

## Run

```bash
pnpm run dev
```

## Notes

- Uses SSE for real-time updates (questions, winners, leaderboard, presence)
- Persists user identity in `localStorage`
- Intermission UI shows winner + countdown

