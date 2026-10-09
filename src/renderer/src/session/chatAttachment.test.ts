import { describe, expect, it } from "vitest";
import { attachmentChunks, ChatAttachmentAssembler, MAX_ATTACHMENT_BYTES } from "./chatAttachment";
import { PROTOCOL_VERSION, parseControlMessage } from "./controlProtocol";
import { Room } from "./room.svelte";

describe("chat attachments", () => {
  it("reassembles out-of-order chunks into the original image", () => {
    const bytes = Uint8Array.from({ length: 20_000 }, (_, index) => index % 251);
    const data = attachmentChunks(bytes);
    const assembler = new ChatAttachmentAssembler();
    const messages = data.map((part, index) => ({
      t: "chat-attachment" as const,
      v: PROTOCOL_VERSION,
      id: "one",
      from: "peer",
      name: "Peer",
      fileName: "photo.png",
      mime: "image/png",
      size: bytes.length,
      at: 1,
      index,
      total: data.length,
      data: part,
    }));
    let result = null;
    for (const message of messages.reverse()) {
      const parsed = parseControlMessage(JSON.stringify(message));
      expect(parsed).toEqual(message);
      if (parsed?.t === "chat-attachment") result = assembler.add(parsed);
    }
    expect(result?.fileName).toBe("photo.png");
    expect(result?.dataUrl).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`);
  });

  it("rejects oversized, unsafe, and malformed attachments", () => {
    const valid = {
      t: "chat-attachment",
      v: PROTOCOL_VERSION,
      id: "one",
      from: "peer",
      name: "Peer",
      fileName: "clip.mp4",
      mime: "video/mp4",
      size: 3,
      at: 1,
      index: 0,
      total: 1,
      data: "AQID",
    };
    expect(
      parseControlMessage(JSON.stringify({ ...valid, size: MAX_ATTACHMENT_BYTES + 1 })),
    ).toBeNull();
    expect(parseControlMessage(JSON.stringify({ ...valid, mime: "image/svg+xml" }))).toBeNull();
    expect(parseControlMessage(JSON.stringify({ ...valid, index: 1 }))).toBeNull();
    expect(parseControlMessage(JSON.stringify({ ...valid, data: "%%%=" }))).toBeNull();
    expect(new ChatAttachmentAssembler().add({ ...valid, data: "AQI" })).toBeNull();
  });

  it("keeps an attachment in the chat when nobody else has joined yet", async () => {
    const room = new Room();
    room.localPeerId = "local";
    await room.sendAttachment(
      new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }),
    );
    expect(room.chatMessages).toHaveLength(1);
    expect(room.chatMessages[0].attachment?.dataUrl).toBe("data:image/png;base64,AQID");
  });
});
