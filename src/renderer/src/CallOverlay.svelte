<script lang="ts">
  import { onMount } from 'svelte'
  import { L } from './translations'
  import type { CallCameraMid, CallChatMessage, CallPeerInfo } from './callTypes'
  import { MAX_ATTACHMENT_BYTES, isSupportedAttachment } from './session/chatAttachment'
  import { cloneSessionDescription } from './Utils'

  let peers = $state<CallPeerInfo[]>([])
  let messages = $state<CallChatMessage[]>([])
  let streams = $state<Record<string, MediaStream>>({})
  let draft = $state('')
  let attachmentInput = $state<HTMLInputElement | null>(null)
  let attachmentSending = $state(false)

  const localPeer = $derived(peers.find((peer) => peer.isLocal))
  const cameraOn = $derived(Boolean(localPeer?.cameraEnabled))

  const attachStream = (node: HTMLVideoElement, stream: MediaStream): { update: (next: MediaStream) => void; destroy: () => void } => {
    node.srcObject = stream
    void node.play?.().catch(() => undefined)
    return {
      update(next: MediaStream) {
        node.srcObject = next
        void node.play?.().catch(() => undefined)
      },
      destroy() {
        node.srcObject = null
      }
    }
  }

  const autoscroll = (node: HTMLDivElement): { destroy: () => void } => {
    const stop = $effect.root(() => {
      $effect(() => {
        void messages.length
        node.scrollTop = node.scrollHeight
      })
    })
    return { destroy: stop }
  }

  const initial = (name: string): string => {
    const trimmed = name.trim()
    return trimmed ? trimmed[0].toUpperCase() : '?'
  }

  const formatTime = (at: number): string => {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const sendChat = (): void => {
    const text = draft.trim()
    if (!text) return
    window.CallApi.sendChat(text)
    draft = ''
  }

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    sendChat()
  }

  const onAttachmentSelected = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (!isSupportedAttachment(file.type) || !file.size || file.size > MAX_ATTACHMENT_BYTES) {
      window.alert('Use a PNG, JPEG, GIF, WebP, MP4, WebM, or OGG file up to 20 MB')
      return
    }
    attachmentSending = true
    try {
      window.CallApi.sendAttachment({ name: file.name, type: file.type, bytes: await file.arrayBuffer() })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    } finally {
      attachmentSending = false
    }
  }

  onMount(() => {
    const pc = new RTCPeerConnection({ iceServers: [] })
    const pendingIce: RTCIceCandidateInit[] = []
    let mids: CallCameraMid[] = []
    let pendingOffer: RTCSessionDescriptionInit | null = null
    let applyingOffer = false
    const pendingTracks: Array<{ mid: string; stream: MediaStream }> = []

    const applyMappedStream = (mid: string, stream: MediaStream): void => {
      const peerId = mids.find((item) => item.mid === mid)?.peerId
      if (!peerId) {
        pendingTracks.push({ mid, stream })
        return
      }
      streams = { ...streams, [peerId]: stream }
    }

    const flushMappedTracks = (): void => {
      const leftover: Array<{ mid: string; stream: MediaStream }> = []
      for (const item of pendingTracks) {
        const peerId = mids.find((mid) => mid.mid === item.mid)?.peerId
        if (peerId) streams = { ...streams, [peerId]: item.stream }
        else leftover.push(item)
      }
      pendingTracks.length = 0
      pendingTracks.push(...leftover)
    }

    const flushIce = async (): Promise<void> => {
      if (!pc.remoteDescription) return
      const queued = pendingIce.splice(0, pendingIce.length)
      for (const candidate of queued) {
        await pc.addIceCandidate(candidate)
      }
    }

    const applyOffer = async (): Promise<void> => {
      if (applyingOffer) return
      applyingOffer = true
      try {
        while (pendingOffer) {
          const sdp = pendingOffer
          pendingOffer = null
          await pc.setRemoteDescription(sdp)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          window.CallApi.sendAnswer(cloneSessionDescription(pc.localDescription ?? answer))
          await flushIce()
        }
      } catch (error) {
        console.error(error)
      } finally {
        applyingOffer = false
      }
    }

    pc.ontrack = (event): void => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      const mid = event.transceiver.mid
      if (mid) applyMappedStream(mid, stream)
    }
    pc.onicecandidate = (event): void => {
      if (event.candidate) window.CallApi.sendIce(event.candidate.toJSON())
    }

    window.CallApi.onChat((next) => {
      messages = next
    })
    window.CallApi.onPeers((next) => {
      peers = next
      const enabled = new Set(next.filter((peer) => peer.cameraEnabled).map((peer) => peer.id))
      const cleaned: Record<string, MediaStream> = {}
      for (const [peerId, stream] of Object.entries(streams)) {
        if (enabled.has(peerId)) cleaned[peerId] = stream
      }
      streams = cleaned
    })
    window.CallApi.onCameraMids((next) => {
      mids = next
      flushMappedTracks()
    })
    window.CallApi.onOffer((sdp) => {
      pendingOffer = sdp
      void applyOffer()
    })
    window.CallApi.onIce((candidate) => {
      if (!pc.remoteDescription) {
        pendingIce.push(candidate)
        return
      }
      void pc.addIceCandidate(candidate)
    })
    window.CallApi.onRequestSync(() => {
      window.CallApi.ready()
    })
    window.CallApi.ready()

    return (): void => {
      pc.close()
    }
  })
</script>

<div class="h-screen flex flex-col bg-base-200 text-base-content" data-theme="business">
  <header class="drag flex items-center justify-between px-3 py-2 bg-base-300">
    <span class="font-semibold text-sm">{L.chat()}</span>
    <div class="no-drag flex gap-1">
      <button
        class="btn btn-ghost btn-sm"
        title={cameraOn ? L.camera_on() : L.camera_off()}
        onclick={() => window.CallApi.toggleCamera()}
      >
        <i class="fa-solid {cameraOn ? 'fa-video' : 'fa-video-slash'}"></i>
      </button>
      <button class="btn btn-ghost btn-sm" title={L.leave()} onclick={() => window.close()}>
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  </header>

  <section class="grid grid-cols-2 gap-2 p-3">
    {#each peers as peer (peer.id)}
      <div class="rounded-box bg-base-100 p-2 flex flex-col items-center gap-1">
        {#if streams[peer.id]}
          <video class="w-full aspect-video rounded-box object-cover bg-black" autoplay playsinline muted use:attachStream={streams[peer.id]}></video>
        {:else if peer.avatar}
          <div class="w-full aspect-video rounded-box flex items-center justify-center bg-base-300">
            <img class="h-20 w-20 rounded-full object-cover" src={peer.avatar} alt="" />
          </div>
        {:else}
          <div
            class="w-full aspect-video rounded-box flex items-center justify-center text-xl font-bold"
            style="background: {peer.backgroundColor}; color: {peer.foregroundColor}"
          >
            {initial(peer.name)}
          </div>
        {/if}
        <span class="text-xs truncate w-full text-center">
          {peer.name}{peer.isLocal ? ` (${L.you()})` : ''}
        </span>
      </div>
    {/each}
  </section>

  <div use:autoscroll class="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
    {#each messages as message (message.id)}
      <!-- chat-end is for messages from other peers, chat-start is for messages from the local peer -->
      <div class="chat {message.from === localPeer?.id ? 'chat-start' : 'chat-end'}">
        <div class="chat-header">
          {message.name}
          <time class="text-xs opacity-50">{formatTime(message.at)}</time>
        </div>
        <div class="chat-bubble">
          {#if message.text}{message.text}{/if}
          {#if message.attachment}
            {#if message.attachment.mime.startsWith('image/')}
              <img class="max-w-full max-h-48 rounded" src={message.attachment.dataUrl} alt={message.attachment.fileName} loading="lazy" />
            {:else}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video class="max-w-full max-h-48 rounded" src={message.attachment.dataUrl} controls preload="metadata" aria-label={message.attachment.fileName}></video>
            {/if}
            <a class="block text-xs underline truncate" href={message.attachment.dataUrl} download={message.attachment.fileName}>{message.attachment.fileName}</a>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <form class="no-drag p-3 pt-0 flex gap-2" onsubmit={onSubmit}>
    <input bind:this={attachmentInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/ogg" onchange={onAttachmentSelected} hidden />
    <button class="btn btn-ghost btn-sm" type="button" title={L.attach_media()} aria-label={L.attach_media()} disabled={attachmentSending} onclick={() => attachmentInput?.click()}><i class:fa-spinner={attachmentSending} class:fa-spin={attachmentSending} class:fa-paperclip={!attachmentSending} class="fa-solid"></i></button>
    <input
      class="input input-bordered input-sm flex-1"
      bind:value={draft}
      placeholder={L.chat_placeholder()}
      maxlength="2000"
    />
    <button class="btn btn-primary btn-sm" type="submit">{L.send()}</button>
  </form>
</div>

<style>
  .drag {
    -webkit-app-region: drag;
  }
  .no-drag {
    -webkit-app-region: no-drag;
  }
</style>
