# Privacy

Effective date: 2026-10-06

a.webo is a desktop app for calls and shared content. Your display name, profile photo, settings, and saved channel links are stored on your device. People in the same call can see your display name and any media or messages you choose to send.

The configured room server processes room identifiers, membership and signaling data so participants can connect. Permanent channel records remain on the server until the service removes them; temporary room records expire. The default service is `signal.nyxlink.online`, hosted on Cloudflare. Cloudflare Realtime TURN may relay encrypted media when a direct connection cannot be established. These services can observe IP addresses, connection metadata, and traffic volume. The app does not upload your invitation's URL fragment secret to the room server.

Media and chat are encrypted between participants at the application layer. A participant you invite can still record or share what they receive. If you open a website in the shared browser, that website receives normal browser requests and may process data under its own policy.

This repository does not implement account registration, analytics, or advertising. Service providers may keep operational logs under their own policies. For questions, open an [Issue](https://github.com/whoslucaxs/JanjaShare/issues) without including private channel links.
