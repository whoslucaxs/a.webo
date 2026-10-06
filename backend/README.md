# a.webo room server

This Cloudflare Worker and Durable Object handle room membership, WebRTC signaling, and short-lived Cloudflare Realtime TURN credentials. Media is sent between desktop clients, directly or through TURN. The server does not host calls or decrypt media. The invitation secret stays in the `webo://` URL fragment and is not posted to the server.

Temporary rooms expire after their selected duration. Permanent channels retain their link and can be opened while the creator is offline. The current call limit is four participants.

## Deploy

1. Activate Cloudflare Realtime TURN in the same account and create a TURN key.
2. In this directory, set `TURN_KEY_ID` and `TURN_API_TOKEN` with `npx wrangler secret put`. Never commit either value.
3. Run `npx wrangler deploy`. The configured custom domain is `signal.nyxlink.online`.
4. Open `https://signal.nyxlink.online/health` and confirm `turnConfigured` is `true`.

Run `node test.mjs` to check the room exchange. The desktop app uses this server by default; Settings can point to another compatible HTTPS server.
