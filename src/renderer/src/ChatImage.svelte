<script lang="ts">
  import { L } from './translations'
  import { zoomAtPointer } from './Utils'

  let { src, alt }: { src: string; alt: string } = $props()
  let dialog: HTMLDialogElement
  let viewport: HTMLDivElement
  let scale = $state(1)
  let x = $state(0)
  let y = $state(0)
  let drag: { pointerId: number; x: number; y: number } | null = null

  const setScale = (next: number, pointerX = 0, pointerY = 0): void => {
    next = Math.max(1, Math.min(5, next))
    if (next === scale) return
    const position = zoomAtPointer(x, y, pointerX, pointerY, scale, next)
    x = next === 1 ? 0 : position.x
    y = next === 1 ? 0 : position.y
    scale = next
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const bounds = viewport.getBoundingClientRect()
    setScale(
      scale * Math.exp(-event.deltaY * 0.0015),
      event.clientX - bounds.left - bounds.width / 2,
      event.clientY - bounds.top - bounds.height / 2,
    )
  }

  const wheelZoom = (node: HTMLDivElement): { destroy: () => void } => {
    node.addEventListener('wheel', onWheel, { passive: false })
    return { destroy: () => node.removeEventListener('wheel', onWheel) }
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (scale === 1) return
    drag = { pointerId: event.pointerId, x: event.clientX - x, y: event.clientY - y }
    viewport.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return
    x = event.clientX - drag.x
    y = event.clientY - drag.y
  }

  const open = (): void => {
    drag = null
    scale = 1
    x = 0
    y = 0
    dialog.showModal()
  }
</script>

<button type="button" class="thumbnail" aria-label={`${L.zoom_in()}: ${alt}`} onclick={open}>
  <img src={src} alt={alt} loading="lazy" />
</button>

<dialog bind:this={dialog} class="image-dialog" aria-label={alt}>
  <div class="viewport" bind:this={viewport} use:wheelZoom role="group" aria-label={alt} onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={() => drag = null} onpointercancel={() => drag = null}>
    <img src={src} alt={alt} draggable="false" style:translate={`${x}px ${y}px`} style:scale={scale} />
  </div>
  <div class="controls">
    <button type="button" aria-label={L.zoom_out()} title={L.zoom_out()} disabled={scale <= 1} onclick={() => setScale(scale - 0.5)}><i class="fa-solid fa-minus"></i></button>
    <span>{Math.round(scale * 100)}%</span>
    <button type="button" aria-label={L.zoom_in()} title={L.zoom_in()} disabled={scale >= 5} onclick={() => setScale(scale + 0.5)}><i class="fa-solid fa-plus"></i></button>
    <button type="button" aria-label={L.dismiss()} title={L.dismiss()} onclick={() => dialog.close()}><i class="fa-solid fa-xmark"></i></button>
  </div>
</dialog>

<style>
  .thumbnail { display: block; max-width: 100%; padding: 0; margin-top: 0.35rem; border: 0; border-radius: 0.55rem; background: var(--ui-input); cursor: zoom-in; overflow: hidden; }
  .thumbnail img { display: block; max-width: min(100%, 18rem); max-height: 15rem; object-fit: contain; }
  .thumbnail:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
  .image-dialog { width: min(96vw, 90rem); height: 94vh; max-width: none; max-height: none; padding: 0; border: 1px solid var(--ui-border); border-radius: 0.7rem; background: var(--ui-panel); color: var(--ui-text); overflow: hidden; }
  .image-dialog::backdrop { background: #000d; }
  .viewport { display: grid; place-items: center; width: 100%; height: 100%; overflow: hidden; touch-action: none; cursor: grab; }
  .viewport:active { cursor: grabbing; }
  .viewport img { max-width: 100%; max-height: 100%; object-fit: contain; user-select: none; pointer-events: none; }
  .controls { position: absolute; top: 0.7rem; right: 0.7rem; display: flex; align-items: center; gap: 0.3rem; padding: 0.25rem; border: 1px solid var(--ui-border); border-radius: 0.5rem; background: var(--ui-panel); }
  .controls button { width: 2rem; height: 2rem; border: 0; border-radius: 0.3rem; background: transparent; color: inherit; cursor: pointer; }
  .controls button:hover:not(:disabled) { background: var(--ui-raised); }
  .controls button:disabled { opacity: 0.4; cursor: default; }
  .controls span { min-width: 3rem; text-align: center; font-size: 0.8rem; }
</style>
