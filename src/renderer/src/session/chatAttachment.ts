import { fromBase64Url, toBase64Url } from "../crypto/constants";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_CHUNK_BYTES = 8190; // Divisible by 3 so encoded chunks concatenate into one data URL.

export const isSupportedAttachment = (mime: unknown): mime is string =>
  typeof mime === "string" && /^(image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm|ogg))$/.test(mime);

export const attachmentDataUrl = (mime: string, chunks: string[]): string => {
  const encoded = chunks.join("").replace(/-/g, "+").replace(/_/g, "/");
  return `data:${mime};base64,${encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")}`;
};

export type AttachmentChunk = {
  id: string;
  from: string;
  name: string;
  fileName: string;
  mime: string;
  size: number;
  at: number;
  index: number;
  total: number;
  data: string;
};

type PendingAttachment = {
  meta: AttachmentChunk;
  chunks: string[];
  received: number;
  startedAt: number;
};

export class ChatAttachmentAssembler {
  private pending = new Map<string, PendingAttachment>();

  add(
    chunk: AttachmentChunk,
  ): { fileName: string; mime: string; size: number; dataUrl: string } | null {
    const now = Date.now();
    for (const [key, item] of this.pending) {
      if (now - item.startedAt > 2 * 60_000) this.pending.delete(key);
    }
    const key = `${chunk.from}:${chunk.id}`;
    let item = this.pending.get(key);
    if (!item) {
      if (this.pending.size >= 4) this.pending.delete(this.pending.keys().next().value!);
      item = { meta: chunk, chunks: Array(chunk.total).fill(""), received: 0, startedAt: now };
      this.pending.set(key, item);
    }
    if (
      item.meta.size !== chunk.size ||
      item.meta.mime !== chunk.mime ||
      item.meta.total !== chunk.total ||
      item.meta.fileName !== chunk.fileName
    ) {
      this.pending.delete(key);
      return null;
    }
    if (item.chunks[chunk.index]) return null;
    const expectedBytes = Math.min(
      ATTACHMENT_CHUNK_BYTES,
      chunk.size - chunk.index * ATTACHMENT_CHUNK_BYTES,
    );
    try {
      if (fromBase64Url(chunk.data).length !== expectedBytes) return null;
    } catch {
      return null;
    }
    item.chunks[chunk.index] = chunk.data;
    item.received++;
    if (item.received !== chunk.total) return null;
    this.pending.delete(key);
    return {
      fileName: chunk.fileName,
      mime: chunk.mime,
      size: chunk.size,
      dataUrl: attachmentDataUrl(chunk.mime, item.chunks),
    };
  }

  clear(): void {
    this.pending.clear();
  }
}

export const attachmentChunks = (bytes: Uint8Array): string[] => {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += ATTACHMENT_CHUNK_BYTES) {
    chunks.push(toBase64Url(bytes.subarray(offset, offset + ATTACHMENT_CHUNK_BYTES)));
  }
  return chunks;
};
