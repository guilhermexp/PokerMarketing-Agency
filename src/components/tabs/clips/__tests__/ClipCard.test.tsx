import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrandProfile, GalleryImage, VideoClipScript } from "@/types";
import { BackgroundJobsProvider } from "../../../../hooks/useBackgroundJobs";

vi.mock("../../common/Button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

vi.mock("../../common/Icon", () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("../../common/Loader", () => ({
  Loader: () => <span>loader</span>,
}));

vi.mock("../../ui/ai-chat-image-generation-1", () => ({
  ImageGenerationLoader: () => <div>loading</div>,
}));

vi.mock("../../common/ImagePreviewModal", () => ({
  ImagePreviewModal: () => null,
}));

vi.mock("../../common/ExportVideoModal", () => ({
  ExportVideoModal: () => null,
}));

vi.mock("../ClipSettingsModal", () => ({
  ClipSettingsModal: () => null,
}));

vi.mock("../../../../hooks/useBackgroundJobs", () => ({
  BackgroundJobsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useBackgroundJobs: () => ({
    onJobComplete: () => () => undefined,
    onJobFailed: () => () => undefined,
  }),
}));

vi.mock("../../../../services/apiClient", () => ({
  getGenerationJobs: vi.fn(async () => []),
  queueGenerationJob: vi.fn(),
  generateVideo: vi.fn(),
  updateClipThumbnail: vi.fn(),
  updateSceneImage: vi.fn(),
  uploadVideo: vi.fn(),
  getVideoDisplayUrl: vi.fn(),
  getCsrfToken: vi.fn(),
  getCurrentCsrfToken: vi.fn(),
}));

function createBrandProfile(): BrandProfile {
  return {
    name: "Poker Club",
    description: "Eventos premium",
    logo: null,
    primaryColor: "#111111",
    secondaryColor: "#222222",
    tertiaryColor: "#333333",
    toneOfVoice: "Profissional",
  };
}

function createClip(): VideoClipScript {
  return {
    id: "clip-1",
    title: "Clip principal",
    hook: "Hook",
    scenes: [
      {
        scene: 1,
        visual: "Visual",
        narration: "Narracao",
        duration_seconds: 3,
      },
    ],
    image_prompt: "Prompt da capa",
    audio_script: "Texto",
  };
}

function createThumbnail(): GalleryImage {
  return {
    id: "gallery-1",
    src: "https://example.com/thumb.png",
    source: "Clipe",
    model: "gemini-3-pro-image-preview",
    video_script_id: "clip-1",
  };
}

describe("ClipCard", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("renders the clip title and the generate cover CTA when there is no thumbnail", async () => {
    const { ClipCard } = await import("../ClipCard");

    render(
      <BackgroundJobsProvider userId="user-1">
        <ClipCard
          clip={createClip()}
          brandProfile={createBrandProfile()}
          thumbnail={null}
          onGenerateThumbnail={vi.fn()}
          onRegenerateThumbnail={vi.fn()}
          isGeneratingThumbnail={false}
          extraInstruction=""
          onExtraInstructionChange={vi.fn()}
          onUpdateGalleryImage={vi.fn()}
          onSetChatReference={vi.fn()}
          selectedImageModel="gemini-3-pro-image-preview"
          onChangeSelectedImageModel={vi.fn()}
        />
      </BackgroundJobsProvider>,
    );

    expect(screen.getAllByText("Clip principal")[0]).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gerar Capa" })).toBeTruthy();
  });

  it("shows the regenerate action when a thumbnail already exists", async () => {
    const { ClipCard } = await import("../ClipCard");

    render(
      <BackgroundJobsProvider userId="user-1">
        <ClipCard
          clip={createClip()}
          brandProfile={createBrandProfile()}
          thumbnail={createThumbnail()}
          onGenerateThumbnail={vi.fn()}
          onRegenerateThumbnail={vi.fn()}
          isGeneratingThumbnail={false}
          extraInstruction=""
          onExtraInstructionChange={vi.fn()}
          onUpdateGalleryImage={vi.fn()}
          onSetChatReference={vi.fn()}
          selectedImageModel="gemini-3-pro-image-preview"
          onChangeSelectedImageModel={vi.fn()}
        />
      </BackgroundJobsProvider>,
    );

    expect(screen.getByTitle("Regenerar capa com instrucao extra")).toBeTruthy();
  });
});
