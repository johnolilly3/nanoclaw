# IPC File Sending via WhatsApp

**Date:** 2026-04-01
**Status:** Draft

## Problem

Container agents can only send text messages via IPC. When an agent has access to files (e.g., zbot with ~/Dropbox/Zack mounted), it cannot send those files through the chat — it can only tell the user where to find them.

## Solution

Add a `file` IPC message type that lets container agents send files through WhatsApp. Follows the existing IPC pattern (agent writes JSON to messages directory, host processes it).

## IPC Message Format

```json
{
  "type": "file",
  "chatJid": "120363427751581577@g.us",
  "filePath": "/workspace/extra/Zack/504-plan-2026.pdf",
  "caption": "Here's the current 504 plan"
}
```

- `filePath`: container-relative path to the file
- `caption`: optional text sent alongside the file

## Changes

### 1. Path Translation (`src/ipc.ts`)

Add a function to resolve container paths back to host paths using the group's registered mount config (`containerConfig.additionalMounts`) and the known fixed mounts (`/workspace/group` → group folder, `/workspace/extra/{name}` → host path).

Resolution order:
1. `/workspace/extra/{name}` → look up in `group.containerConfig.additionalMounts`
2. `/workspace/group/` → resolve to `groups/{folder}/`
3. `/workspace/project/` → resolve to project root (main group only)

If the path doesn't match any known mount, reject it (prevents path traversal).

### 2. WhatsApp Channel (`src/channels/whatsapp.ts`)

Add `sendFile(jid: string, filePath: string, caption?: string): Promise<void>`:
- Read file from host path
- Detect mimetype from extension using a simple map (pdf, png, jpg, doc, docx, xlsx, csv, txt)
- Send via Baileys: `sock.sendMessage(jid, { document: buffer, mimetype, fileName, caption })`
- No retry queue for file sends (unlike text messages) — log error on failure

### 3. Channel Interface (`src/types.ts`)

Add optional `sendFile` to the Channel interface so other channels can implement it later:
```ts
sendFile?(jid: string, filePath: string, caption?: string): Promise<void>;
```

### 4. IPC Handler (`src/ipc.ts`)

In the messages processing loop, add handling for `type: "file"`:
- Validate `chatJid` and `filePath` are present
- Apply same authorization as `send_message` (non-main can only send to own chat)
- Resolve container path to host path
- Verify file exists on host
- Call `deps.sendFile(chatJid, hostPath, caption)`

### 5. IPC Dependencies

Add `sendFile` to the `IpcDeps` interface so the host can inject the WhatsApp channel's `sendFile` method.

### 6. Container Agent Awareness

Update `groups/zbot/CLAUDE.md` (and the container skills documentation) to tell agents they can send files by writing the IPC JSON. The existing `mcp__nanoclaw__send_message` tool writes to the messages directory — agents can write the file JSON the same way.

## Authorization

Same rules as text messages:
- Non-main groups can only send files to their own registered chat JID
- Main group can send to any registered group's chat JID

## Security

- Container path must resolve to a known mount — no arbitrary host path access
- File must exist on host after resolution
- Blocked patterns from mount-allowlist still apply (no .ssh, .env, etc.)

## Error Handling

- Container path doesn't resolve to any mount → log warning, skip
- Resolved host file doesn't exist → log warning, skip
- Baileys send fails → log error, no retry

## Scope

- WhatsApp only (Telegram, Gmail can add `sendFile` later)
- No image-specific handling (sends everything as document)
- No file size limit enforcement (WhatsApp enforces its own ~100MB limit)

## Testing

- Unit test for path translation function
- Unit test for IPC file message handling (mock sendFile)
- Manual test: send `@zbot` a request that triggers file sending from Dropbox mount
