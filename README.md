# a.webo

Desktop app for voice channels, chat, camera, screen sharing, and shared browser pages on Windows and Linux. Create a temporary channel or a permanent channel, then invite others with a `webo://` link. A permanent channel keeps its link when everyone leaves.

## Download

Builds from every commit on `main` are available as [GitHub Actions artifacts](https://github.com/whoslucaxs/JanjaShare/actions/workflows/release.yaml). Tagged versions (`vX.Y.Z`) are published on the [Releases page](https://github.com/whoslucaxs/JanjaShare/releases) with a Windows installer, a Windows portable executable, and a Linux x64 AppImage.

## Use

1. Open a.webo and enter your display name.
2. Create a temporary or permanent channel, or paste a `webo://` invitation to join one.
3. Share the channel link. Screen, camera, and browser streams can be started during the call. Other participants choose which streams to watch.

The default room server is `https://signal.nyxlink.online`. It exchanges connection information and supplies short-lived TURN credentials. Calls use a WebRTC mesh: each participant connects to the others, directly when possible or through TURN when needed. The room server does not forward media. This architecture works best for small calls; the current room limit is four participants.

## Develop

Requires Node.js 24 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Run `pnpm test` and `pnpm run build` before publishing changes. Build locally with `pnpm run build:windows` on Windows, or `pnpm run build` followed by `pnpm exec electron-builder --linux AppImage --x64 --publish never` on Linux. Outputs are written to `dist/`.

The signaling server lives in [`backend/`](backend/README.md). Its deployment needs Cloudflare Workers, Durable Objects, and Realtime TURN credentials.

## Security and license

Media and chat use application end-to-end encryption with MLS-managed keys. WebRTC also encrypts transport, but transport encryption alone does not prove application end-to-end encryption. See [SECURITY.md](SECURITY.md) for limitations and vulnerability reporting.

Licensed under [MIT](LICENSE). The license preserves required notices from earlier contributors.
