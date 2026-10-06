---
title: Process and protocol boundaries
excerpt: How the desktop app separates media, signaling, and cryptography.
description: How the desktop app separates media, signaling, and cryptography.
order: 0
---

The renderer manages the room, peer connections, media tracks, chat, and MLS state.
Electron main manages window lifecycle, the screen picker, and local settings.
The preload exposes only the APIs the renderer needs.

Peer connections carry `control` and `mls` data channels. Audio, camera, and screen
streams use WebRTC media tracks. The room server relays signaling, while STUN/TURN
helps establish or relay media connectivity. The server does not receive room keys.

Invite URLs (`webo://`) carry a room identifier and bootstrap secret. The secret
stays in the URL fragment and is not sent to the signaling server.
