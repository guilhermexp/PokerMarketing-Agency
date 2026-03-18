import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import {
  isResponseEnvelope,
  sendError,
  sendSuccess,
} from "../../server/lib/response.js";

function createResponseMock() {
  const json = vi.fn();

  return {
    json,
  } as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    _rawJson?: ReturnType<typeof vi.fn>;
  };
}

describe("response helpers", () => {
  it("detects response envelopes", () => {
    expect(
      isResponseEnvelope({ data: {}, error: null, meta: null }),
    ).toBe(true);
    expect(isResponseEnvelope({ data: {} })).toBe(false);
  });

  it("sends success envelopes through res.json by default", () => {
    const res = createResponseMock();

    sendSuccess(res, { ok: true });

    expect(res.json).toHaveBeenCalledWith({
      data: { ok: true },
      error: null,
      meta: null,
    });
  });

  it("prefers _rawJson when available", () => {
    const res = createResponseMock();
    const rawJson = vi.fn();
    res._rawJson = rawJson;

    sendSuccess(res, { ok: true }, { page: 1 });

    expect(rawJson).toHaveBeenCalledWith({
      data: { ok: true },
      error: null,
      meta: { page: 1 },
    });
    expect(res.json).not.toHaveBeenCalled();
  });

  it("normalizes string and nested envelope errors", () => {
    const res = createResponseMock();

    sendError(res, {
      data: null,
      error: {
        message: "nested error",
        code: "NESTED",
      },
      meta: null,
    });

    expect(res.json).toHaveBeenCalledWith({
      data: null,
      error: {
        message: "nested error",
        code: "NESTED",
      },
      meta: null,
    });
  });
});
