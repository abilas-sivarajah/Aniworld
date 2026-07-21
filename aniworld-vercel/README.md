# AniWorld / SerienStream — Vercel Edition

A **Next.js (App Router, TypeScript)** rewrite of the original .NET
`SerienStreamAPI.WebApp`, built to deploy on **Vercel** with zero external
services.

It lets you search for series & animes on [s.to](https://s.to/) /
[aniworld.to](https://aniworld.to/), browse seasons, episodes and movies, and
extract the direct video-stream URL of common hosters (VOE, Streamtape,
Doodstream, Vidoza) to play right in the browser.

> **Legal notice:** For educational purposes only. Accessing copyrighted
> content without permission may be illegal in your country. Use at your own
> risk.

---

## Why a rewrite?

The original app is ASP.NET Core (.NET 10), which Vercel does not support. This
version reimplements the scraping library and API in TypeScript so everything
runs as Vercel serverless functions:

| Original (.NET)                       | This project (Next.js)                          |
| ------------------------------------- | ----------------------------------------------- |
| `SerienStreamClient` (HtmlAgilityPack)| `lib/serienstream.ts` (cheerio)                 |
| `DownloadClient` stream extraction    | `lib/hoster.ts` (fetch + regex, **no FFmpeg**)  |
| `RequestHelper`                       | `lib/http.ts` (fetch + undici)                  |
| `Program.cs` minimal-API endpoints    | `app/api/*/route.ts` route handlers             |
| In-memory singleton config            | per-browser cookie (`lib/config.ts`)            |
| `wwwroot` static SPA                  | `app/page.tsx` React UI + `app/globals.css`     |

The original app never downloaded video server-side (only the unused
`DownloadAsync` used FFmpeg), so **no FFmpeg or long-running work is needed** —
which is exactly why this port fits Vercel's serverless model.

## API endpoints

All under `/api`, identical contract to the original:

- `GET /api/config` · `POST /api/config`
- `GET /api/search?keyword=`
- `GET /api/series?title=`
- `GET /api/episodes?title=&season=`
- `GET /api/movies?title=`
- `GET /api/video-info?title=&season=&episode=&isMovie=`
- `POST /api/extract-stream` `{ videoUrl, hoster }`
- `GET /api/auth/status` · `POST /api/auth/login`

## Local development

```bash
npm install
npm run dev
# http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel — it auto-detects Next.js, no config needed.
3. (Optional) set the env vars from `.env.example` in the Vercel dashboard.

Every API route pins `runtime = "nodejs"` because the scraping stack relies on
`cheerio`, `Buffer` and `undici`.

## Configuration

Settings (host URL, site type, TLS bypass, optional SHA-256 password gate) are
editable at runtime via the ⚙️ dialog and persisted in an httpOnly cookie.
Environment variables in `.env.example` only seed the initial defaults.
