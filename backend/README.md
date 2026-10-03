# JanjaShare signaling server

Cloudflare Worker + Durable Object for one-link room setup. The server exchanges WebRTC offers and answers and issues short-lived Cloudflare Realtime TURN credentials. The invite's encryption secret stays in the `kiwi://` URL fragment and is never posted to the server. Media remains WebRTC peer-to-peer when possible and uses TURN when needed. Temporary rooms expire after four hours. Permanent channels keep the same link and elect a new signaling host when the previous host leaves; media is live only while participants are connected. Calls accept up to four participants.

## Deploy

1. Activate Cloudflare Realtime TURN in the same account and create a TURN key.
2. Set `TURN_KEY_ID` and `TURN_API_TOKEN` as Wrangler secrets, using the key ID and API token from Cloudflare Realtime TURN. Never commit either value.
3. Run `npx wrangler deploy` in this directory. The custom domain is `signal.nyxlink.online`.
4. Check `https://signal.nyxlink.online/health`: `turnConfigured` must be `true`.

`node test.mjs` checks the room exchange. The desktop app defaults to this domain; Settings can point at another HTTPS server.
