# a.webo

Desktop app for voice channels, chat, camera, screen sharing, and shared browser pages on Windows and Linux. Create a temporary channel or a permanent channel, then invite others with a `webo://` link. A permanent channel keeps its link when everyone leaves.

## Download

Every new commit on `main` automatically increments the patch version, builds Windows and Linux, creates a `vX.Y.Z` tag, and publishes a [Release](https://github.com/whoslucaxs/a.webo/releases) with a Windows installer, a Windows portable executable, and a Linux x64 AppImage. Build artifacts are also available in [GitHub Actions](https://github.com/whoslucaxs/a.webo/actions/workflows/release.yaml).

The installed Windows app and Linux AppImage check GitHub Releases when they start and every six hours. When a newer version is available, the app asks before downloading and installing it. The Windows portable build opens the Release download page instead. The first build with this updater must be installed manually.

To require an update after a breaking change, set `minimumVersion` in [`update-policy.json`](update-policy.json) to the oldest supported `X.Y.Z` version and commit it to `main`. Clients below that version see a blocking update prompt once they can reach GitHub and a newer Release is available. Publish that Release before raising the minimum. This policy applies only to clients that already include the updater; it does not remotely disable older builds. If GitHub is unreachable, the app remains usable.

## Use

1. Open a.webo and enter your display name.
2. Create a temporary or permanent channel, or paste a `webo://` invitation to join one.
3. Share the channel link. Screen, camera, and browser streams can be started during the call. Other participants choose which streams to watch.

The chat can send images (PNG, JPEG, GIF, WebP) and videos (MP4, WebM, OGG) up to 20 MB to people currently in the call. Attachments travel over the encrypted peer connection and are available only while the call remains open; the room server does not store them.

On Windows, screen and window sharing also captures the computer's system audio. Viewers receive it only while watching that share. Electron's display capture loopback is not available on Linux, so Linux screen and window sharing remain video-only; integrated browser sharing has its own audio capture.

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
