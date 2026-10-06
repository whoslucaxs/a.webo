---
title: End-to-end encryption threat model
excerpt: |
  a.webo is a desktop WebRTC mesh. Signaling and STUN/TURN may observe
  connection metadata.
description: |
  a.webo is a desktop WebRTC mesh. Signaling and STUN/TURN may observe
  connection metadata.
order: 1
---

a.webo is a desktop WebRTC mesh. Signaling and STUN/TURN may observe
connection metadata.

## Assets

- Chat and media-state messages
- Screen, camera, and microphone media
- Device identity keys
- MLS epoch secrets and exporters
- Invite bootstrap secrets (URL fragments)

## Adversaries

- Anyone who can read the invite URL path/SDP
- A compromised or curious signaling or TURN operator
- A passive network observer
- A removed peer who still has old epoch material
- A newly joined peer who should not read earlier traffic
- A peer who replays control messages

## Guarantees

- Application payloads and media keys are held by room members, not by TURN.
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
