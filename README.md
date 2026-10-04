<div align="center">

![a.webo icon](logo.png)

# a.webo

Audio channels, video calls, and screen sharing for Windows, macOS, and Linux.

</div>

Create temporary rooms or permanent channels and invite people with a `webo://` link. The room server at `https://signal.nyxlink.online` handles signaling; media uses WebRTC.

## Windows builds

Run `pnpm build:windows` to create the installer and portable executable in `dist/`.

Based on the MIT-licensed p2p.kiwi project. See [LICENSE](LICENSE) for the original license.

## `E2EE` (End-to-End Encryption)

> [!WARNING]
> Don't determine whether the call is `E2EE` by checking whether WebRTC reports `DTLS-SRTP`.
> `DTLS-SRTP` is expected to encrypt transport.
>
> Our actual `E2EE` guarantee comes from [`MLS`-managed application keys](https://www.rfc-editor.org/rfc/rfc9420.html) encrypting the media with [`SFrame`](https://www.rfc-editor.org/rfc/rfc9605.html).

### `E2EE` (End-to-End Encryption) Architecture

```
┌─────────────────────────────────────────────┐
│                  MLS                        │
│       membership + E2EE key management      │
├─────────────────────────────────────────────┤
│                 SFrame                      │
│       E2EE encryption of media frames       │
├─────────────────────────────────────────────┤
│               DTLS-SRTP                     │
│          WebRTC transport security          │
├─────────────────────────────────────────────┤
│               ICE / UDP                     │
│               networking                    │
└─────────────────────────────────────────────┘
```

**`MLS` answers:**
"Who is in this encrypted group, and what cryptographic secrets should they possess?"

**`SFrame` answers:**
"How do I encrypt this video/audio frame so infrastructure carrying it can't read it?"

**`DTLS-SRTP`** answers:
"How do I securely transport WebRTC media over this connection?"

### `E2EE` (End-to-End Encryption) Example

```
     MLS Group
┌─────────────────┐
│ Alice Bob Carol │
└────────┬────────┘
         │
 derives E2EE keys
         │
         ▼
      SFrame
   encrypt media
         │
         ▼
     DTLS-SRTP
         │
 WebRTC transport
         │
         ▼
        Peer
```
