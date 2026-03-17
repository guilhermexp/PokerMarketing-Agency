function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isResponseEnvelope(payload) {
  return isPlainObject(payload) &&
    Object.prototype.hasOwnProperty.call(payload, "data") &&
    Object.prototype.hasOwnProperty.call(payload, "error") &&
    Object.prototype.hasOwnProperty.call(payload, "meta");
}

function normalizeError(error) {
  if (!error) {
    return { message: "An unexpected error occurred" };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.statusCode ? { statusCode: error.statusCode } : {}),
      ...(error.requestId ? { requestId: error.requestId } : {}),
      ...(error.timestamp ? { timestamp: error.timestamp } : {}),
      ...(error.details ? { details: error.details } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  if (isPlainObject(error)) {
    if (isResponseEnvelope(error)) {
      return normalizeError(error.error);
    }

    if ("error" in error) {
      if (typeof error.error === "string") {
        return {
          message: error.error,
          ...(error.details ? { details: error.details } : {}),
        };
      }

      if (isPlainObject(error.error)) {
        return {
          ...error.error,
          ...(error.details ? { details: error.details } : {}),
        };
      }
    }

    return error;
  }

  return { message: "An unexpected error occurred" };
}

export function sendSuccess(res, data, meta = null) {
  const payload = {
    data,
    error: null,
    meta: meta ?? null,
  };

  if (typeof res._rawJson === "function") {
    return res._rawJson(payload);
  }

  return res.json(payload);
}

export function sendError(res, error) {
  const payload = {
    data: null,
    error: normalizeError(error),
    meta: null,
  };

  if (typeof res._rawJson === "function") {
    return res._rawJson(payload);
  }

  return res.json(payload);
}
