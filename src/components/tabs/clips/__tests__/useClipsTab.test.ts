import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/tabs/clips/useClipsTab.ts"),
  "utf8",
);

describe("useClipsTab source contract", () => {
  it("prioritizes exact gallery matches by clip id when initializing thumbnails", () => {
    expect(source).toContain("img.source === \"Clipe\" && img.video_script_id === clip.id");
    expect(source).toContain("const exactMatch = galleryImages.find(");
  });

  it("captures thumbnail generation failures into generationState.errors", () => {
    expect(source).toContain("newErrors[index] = (err instanceof Error ? err.message : 'Falha ao gerar imagem.')");
    expect(source).toContain("newGenerating[index] = false");
  });

  it("returns the public actions used by the clips tab UI", () => {
    expect(source).toContain("handleGenerateThumbnail");
    expect(source).toContain("handleGenerateAllForClip");
    expect(source).toContain("sceneImageTriggers");
  });
});
