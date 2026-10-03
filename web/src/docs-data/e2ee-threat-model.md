---
title: End-to-end encryption threat model
excerpt: |
  p2p.kiwi is a desktop WebRTC mesh. Signaling and STUN/TURN may observe
  connection metadata.
description: |
  p2p.kiwi is a desktop WebRTC mesh. Signaling and STUN/TURN may observe
  connection metadata.
order: 1
---

p2p.kiwi is a desktop WebRTC mesh. Signaling and STUN/TURN may observe
connection metadata.

## Assets

- Chat, vote, presenter, kick, and camera-state messages
- Screen, camera, and microphone media
- Device identity keys
- MLS epoch secrets and exporters
- Invite bootstrap secrets (URL fragments)

## Adversaries

- Anyone who can read the invite URL path/SDP
- A compromised or curious TURN/STUN operator, or a future SFU
  - Selective Forwarding Unit (SFU) is a media server used in WebRTC applications to forward audio,
    video, and screen-sharing streams between participants
- A passive network observer
- A removed peer who still has old epoch material
- A newly joined peer who should not read earlier traffic
- A peer who replays votes or kicks

## Guarantees

- Application payloads and media keys are held by room members, not by
  TURN or a future SFU.
  - Selective Forwarding Unit (SFU) is a media server used in WebRTC applications to forward audio,
    video, and screen-sharing streams between participants
- Membership changes rotate the MLS epoch. A removed member cannot
  decrypt later application or media traffic.
- A joiner receives current-epoch secrets only.
- Control operations bind epoch, sender, room, and operation id.
- Invite bootstrap secrets stay in the URL fragment and are never
  logged or sent as HTTP query parameters.

## Non-goals

- A compromised endpoint can read plaintext available to that endpoint.
- E2EE does not hide ICE/SDP/TURN metadata.
- An unverified invite can still be socially redirected.
- Screen content is plaintext at the capturing and viewing endpoints.
