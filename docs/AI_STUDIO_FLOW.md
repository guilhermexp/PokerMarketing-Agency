AI Studio Flow (Chat Edit, Preview, Approval)

Overview
- This document describes the end-to-end flow for image editing via the chat assistant ("AI Studio").
- It covers: tool approval, opening the editor, generating previews, approving, and syncing the result.

Entry Points
- Chat panel: Vercel AI SDK chat (`src/components/assistant/AssistantPanelNew.tsx`).
- Image editor: AI Studio modal (`src/components/image-preview/ImagePreviewModal.tsx`).
- Server tool: editImage (`server/lib/ai/tools/edit-image.mjs`).

Key Concepts
- Tool call: The model requests `editImage` and the UI requires approval.
- AI Studio: The image editor UI used for preview and manual approval.
- Tool output: The result sent back to the AI SDK after approval.
- Preview mode: Shows before/after for the edited image.

Step-by-Step Flow
1) User attaches a reference image in the chat panel.
   - The chat message includes a `file` part with `filename` and `url`.
   - `useChat` sends the message to `/api/chat`.

2) The chat API selects the reference image.
   - `server/api/chat/route.mjs` inspects message parts for a `file` part.
   - It sets `chatReferenceImage` for tool execution.

3) The model requests an edit via tool call.
   - The AI SDK emits a tool part: `type: "tool-editImage"`, `state: "approval-requested"`.
   - The chat UI detects it and opens AI Studio.

4) AI Studio opens with the reference image.
   - `AssistantPanelNew` calls `onRequestImageEdit(...)`.
   - `App.tsx` finds the image in the gallery and sets:
     - `editingImage` (to open the modal)
     - `pendingToolEdit` (to mark a tool approval flow)

5) AI Studio auto-runs the edit for tool approval.
   - `useAiEdit` sees `pendingToolEdit` and triggers `handleEdit()`.
   - The edit uses local `editImage` service, producing a data URL preview.

6) The preview shows before/after.
   - `ImagePreviewCompare` renders the original and edited images.
   - The footer shows Approve/Reject buttons in tool approval mode.

7) User approves in AI Studio.
   - `handleSaveEdit()` uploads the preview if needed and calls `onToolEditComplete`.
   - `App.tsx` marks `pendingToolEdit` as approved with `imageUrl`.

8) Chat sends tool output and approval response.
   - `AssistantPanelNew`:
     - Sends `addToolApprovalResponse` (approved).
     - Sends `addToolOutput` with `imageUrl`, `prompt`, and reference details.
   - The chat refreshes and continues the conversation.

9) AI Studio reopens with final before/after (post-tool preview).
   - When the tool output arrives, `AssistantPanelNew` calls `onShowToolEditPreview`.
   - `App.tsx` opens the AI Studio modal with `initialEditPreview`.
   - This is view-only preview, no re-execution of the edit.

Step-by-Step (Reject)
1) User clicks Reject in AI Studio.
2) `App.tsx` marks `pendingToolEdit` as rejected.
3) `AssistantPanelNew` sends:
   - `addToolApprovalResponse` (denied)
   - `addToolOutput` with `state: "output-denied"`
4) Chat updates and shows the rejection.

Important Data Shapes
- Tool approval part:
  - `type: "tool-editImage"`
  - `state: "approval-requested"`
  - `approval.id` (required to respond)
  - `input.prompt`
- Tool output (success):
  - `output.imageUrl` (required)
  - `output.prompt`
  - `output.referenceImageId`
  - `output.referenceImageUrl`
- Tool output (denied):
  - `state: "output-denied"`
  - `errorText`

Where to Look
- Chat UI: `src/components/assistant/AssistantPanelNew.tsx`
  - Tool approval detection
  - `onRequestImageEdit` (opens AI Studio)
  - `addToolApprovalResponse` + `addToolOutput`
  - Post-tool preview (`onShowToolEditPreview`)
- AI Studio modal: `src/components/image-preview/ImagePreviewModal.tsx`
  - Tool approval buttons
  - Compare view
- AI Studio logic: `src/components/image-preview/hooks/useAiEdit.ts`
  - Auto-exec edit when `pendingToolEdit` exists
  - `initialEditPreview` support
- Server tool: `server/lib/ai/tools/edit-image.mjs`
  - `needsApproval: true`
  - Returns `imageUrl`, `referenceImageId`, `referenceImageUrl`

Common Problems and Fixes
1) AI Studio does not open for edit tool
   - Check tool part: must be `type: "tool-editImage"` and `state: "approval-requested"`.
   - Ensure `onRequestImageEdit` is wired (App -> Dashboard -> AssistantPanelNew).

2) Approval button clicked but chat does not update
   - Make sure `addToolApprovalResponse` is sent with the correct `approval.id`.
   - Ensure `addToolOutput` is called after approval with `imageUrl`.

3) Preview shows but image URL not updated
   - Confirm `pendingToolEdit.result` and `pendingToolEdit.imageUrl` are set in `App.tsx`.
   - Verify tool output includes `imageUrl`.

4) AI Studio opens but edit does not run
   - Check `pendingToolEdit.prompt` and `pendingToolEdit.imageId`.
   - Ensure the reference image is in the gallery.

5) Overlay stuck on loading
   - Chat loading only shows when the last message is from the user.
   - Check `status` from `useChat` and the last message role.

Debug Tips
- Enable console logs in:
  - `AssistantPanelNew` tool part logs.
  - `useAiEdit` auto-execution logs.
  - `edit-image` tool responses.
- Inspect message parts in the browser devtools to confirm tool states and outputs.

Env Flags
- `VITE_USE_VERCEL_AI_SDK=true` enables the new chat panel and AI Studio flow.
- `INTERNAL_API_TOKEN` required for server-side tool calls in production.
