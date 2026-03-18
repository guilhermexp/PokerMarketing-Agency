import { getApiErrorMessage, parseApiResponse } from "../api/response";
import {
  clearCsrfToken,
  getCsrfToken,
  getCurrentCsrfToken,
} from "./csrf";

export interface UploadResult {
  success: boolean;
  url: string;
  filename: string;
  size: number;
}

export async function uploadToBlob(
  blob: Blob,
  filename: string,
  contentType: string,
): Promise<UploadResult> {
  if (!blob || blob.size === 0) {
    throw new Error("Cannot upload empty blob");
  }

  const arrayBuffer = await blob.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error("Blob contains no data");
  }

  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      "",
    ),
  );

  if (!getCurrentCsrfToken()) {
    await getCsrfToken();
  }

  const response = await fetch("/api/upload", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(getCurrentCsrfToken() ? { "X-CSRF-Token": getCurrentCsrfToken()! } : {}),
    },
    body: JSON.stringify({ filename, contentType, data: base64 }),
  });

  if (!response.ok) {
    if (response.status === 403) {
      clearCsrfToken();
    }
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(getApiErrorMessage(error, `HTTP ${response.status}`));
  }

  return parseApiResponse<UploadResult>(response);
}

export async function uploadVideo(blob: Blob, filename?: string): Promise<string> {
  const result = await uploadToBlob(blob, filename || `video-${Date.now()}.mp4`, "video/mp4");
  return result.url;
}

export async function uploadAudio(blob: Blob, filename?: string): Promise<string> {
  const result = await uploadToBlob(
    blob,
    filename || `audio-${Date.now()}.wav`,
    blob.type || "audio/wav",
  );
  return result.url;
}
