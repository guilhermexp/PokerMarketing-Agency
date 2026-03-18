import { describe, expect, it } from "vitest";
import {
  AppError,
  ConfigurationError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  NotFoundError,
  OrganizationAccessError,
  PermissionDeniedError,
  ValidationError,
  createValidationError,
  isOperationalError,
} from "../../server/lib/errors/index.js";

describe("error helpers", () => {
  it("builds typed operational errors", () => {
    const error = new ValidationError("invalid payload", { field: "name" });

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: "name" });
    expect(isOperationalError(error)).toBe(true);
  });

  it("creates field-based validation errors", () => {
    const error = createValidationError({
      email: "required",
      name: "too short",
    });

    expect(error.message).toBe("Validation failed");
    expect(error.details).toEqual({
      errors: [
        { field: "email", message: "required" },
        { field: "name", message: "too short" },
      ],
    });
  });

  it("formats specialized error messages", () => {
    expect(new PermissionDeniedError("publish_post").message).toContain(
      "publish_post",
    );
    expect(new OrganizationAccessError().statusCode).toBe(403);
    expect(new NotFoundError("Campaign", "123").message).toBe(
      "Campaign not found: 123",
    );
    expect(new ConflictError("already exists").statusCode).toBe(409);
  });

  it("captures original context for infrastructure errors", () => {
    const dbError = new DatabaseError("db failed", {
      message: "connection refused",
      code: "ECONNREFUSED",
    });
    const externalError = new ExternalServiceError(
      "blob",
      "upload failed",
      new Error("timeout"),
      502,
    );
    const configError = new ConfigurationError("Missing API key", "API_KEY");

    expect(dbError.details).toEqual({
      originalMessage: "connection refused",
      code: "ECONNREFUSED",
    });
    expect(externalError.details).toEqual({
      service: "blob",
      originalMessage: "timeout",
    });
    expect(configError.isOperational).toBe(false);
    expect(isOperationalError(configError)).toBe(false);
  });

  it("serializes AppError to JSON with optional stack", () => {
    const error = new AppError(
      "exploded",
      "EXPLODED",
      500,
      true,
      { scope: "test" },
    );

    const withoutStack = error.toJSON();
    const withStack = error.toJSON(true);

    expect(withoutStack.error.details).toEqual({ scope: "test" });
    expect(withoutStack.error.stack).toBeUndefined();
    expect(withStack.error.stack).toBeTypeOf("string");
  });
});
