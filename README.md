# Avalon: The Resistance — In-Person

Web app to run in-person Avalon sessions. Handles role assignment, automated audio narration, QR code room joining, and an integrated rules guide.

**Live:**
- 🇧🇷 [jogos.deyvyd.com/avalon](https://jogos.deyvyd.com/avalon) — Portuguese
- 🇺🇸 [games.deyvyd.com/avalon](https://games.deyvyd.com/avalon) — English

Language detected automatically from subdomain (`games.*` → EN, otherwise → PT).

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS 4
- Socket.io (real-time WebSocket room sync)
- react-i18next + i18next (i18n)
- Render (hosting)

## Run locally

**Prerequisites:** Node.js ≥ 20

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server (Express + Vite HMR) |
| `npm run build` | Production build |
| `npm run start` | Start production server (requires build) |
| `npm run lint` | TypeScript type-check |

## Deploy (Render)

Build command: `npm install; npm run build`  
Start command: `npm run start`

Required environment variables:
- `NODE_ENV=production`
- `PORT=3000` (optional, defaults to 3000)

Both domains (`jogos.deyvyd.com` and `games.deyvyd.com`) point via CNAME to the same Render service. Language detection is client-side via `window.location.hostname`.

## Structure

```
src/
  App.tsx              # Root component, routes, Socket.io client
  core/avalon.ts       # Role logic, narration, assignments
  components/
    GameGuide.tsx      # Quick rules reference
    GameManual.tsx     # Full game manual
  i18n/
    index.ts           # i18next setup + subdomain language detector
    locales/
      pt.json          # Portuguese strings
      en.json          # English strings
server.ts              # Express + Socket.io server
```
