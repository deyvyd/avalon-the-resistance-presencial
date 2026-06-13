# Avalon: The Resistance — Presencial

App para conduzir partidas presenciais de Avalon. Narração automática com áudio, distribuição de papéis, QR code para entrada na sala e guia de regras integrado.

**Live:**
- 🇧🇷 [jogos.deyvyd.com/avalon](https://jogos.deyvyd.com/avalon) — Português
- 🇺🇸 [games.deyvyd.com/avalon](https://games.deyvyd.com/avalon) — English

Idioma detectado automaticamente pelo subdomínio (`games.*` → EN, qualquer outro → PT).

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS 4
- Socket.io (WebSocket para sync de sala em tempo real)
- react-i18next + i18next (internacionalização)
- Render (hospedagem)

## Rodar localmente

**Pré-requisitos:** Node.js ≥ 20

```bash
npm install
```

```bash
npm run dev
```

Abre em `http://localhost:3000`.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Express + Vite HMR) |
| `npm run build` | Build de produção |
| `npm run start` | Inicia servidor de produção (requer build) |
| `npm run lint` | Type-check TypeScript |

## Deploy (Render)

Build command: `npm install; npm run build`  
Start command: `npm run start`

Variáveis de ambiente necessárias:
- `NODE_ENV=production`
- `PORT=3000` (opcional, padrão 3000)

Ambos os domínios (`jogos.deyvyd.com` e `games.deyvyd.com`) apontam via CNAME para o mesmo serviço Render. A detecção de idioma é client-side via `window.location.hostname`.

## Estrutura

```
src/
  App.tsx              # Componente raiz, rotas, Socket.io client
  core/avalon.ts       # Lógica de papéis, narração, atribuições
  components/
    GameGuide.tsx      # Guia rápido de regras
    GameManual.tsx     # Manual completo
  i18n/
    index.ts           # Setup i18next + detecção de idioma
    locales/
      pt.json          # Strings em português
      en.json          # Strings em inglês
server.ts              # Servidor Express + Socket.io
```
