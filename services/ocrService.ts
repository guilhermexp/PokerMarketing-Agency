/**
 * OCR Service
 * Automatic text detection using Tesseract.js
 */

import Tesseract from "tesseract.js";

export interface TextRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  confidence: number;
}

/**
 * Detect text regions in an image using OCR
 * Returns bounding boxes for each word/line detected
 */
export async function detectTextRegions(
  imageUrl: string,
  onProgress?: (progress: number) => void
): Promise<TextRegion[]> {
  // Create worker with Portuguese and English support
  const worker = await Tesseract.createWorker("por+eng", Tesseract.OEM.DEFAULT, {
    logger: (m: Tesseract.LoggerMessage) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    // Recognize text with blocks output enabled
    const { data } = await worker.recognize(imageUrl, {}, { blocks: true });

    const regions: TextRegion[] = [];

    // Extract bounding boxes from lines
    if (data.blocks) {
      for (const block of data.blocks) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            // Lower confidence for stylized text
            if (line.confidence > 25 && line.text.trim().length > 1) {
              regions.push({
                left: line.bbox.x0,
                top: line.bbox.y0,
                width: line.bbox.x1 - line.bbox.x0,
                height: line.bbox.y1 - line.bbox.y0,
                text: line.text,
                confidence: line.confidence,
              });
            }
          }
        }
      }
    }

    // Light filtering - only remove obvious noise
    const filteredRegions = regions.filter((region) => {
      const area = region.width * region.height;
      // Filter out tiny regions (likely noise)
      if (area < 400) return false;
      // Filter out single character detections
      if (region.text.replace(/\s/g, "").length < 2) return false;
      return true;
    });

    return filteredRegions;
  } finally {
    await worker.terminate();
  }
}

/**
 * Draw text regions on a canvas as protection mask
 */
export function drawTextRegionsOnCanvas(
  canvas: HTMLCanvasElement,
  regions: TextRegion[],
  padding: number = 20
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Clear canvas first
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw green rectangles for each text region
  ctx.fillStyle = "rgba(0, 255, 100, 0.6)";

  for (const region of regions) {
    ctx.fillRect(
      Math.max(0, region.left - padding),
      Math.max(0, region.top - padding),
      region.width + padding * 2,
      region.height + padding * 2
    );
  }
}

/**
 * Merge overlapping or nearby text regions
 */
export function mergeNearbyRegions(
  regions: TextRegion[],
  threshold: number = 30
): TextRegion[] {
  if (regions.length === 0) return [];

  // Sort by top position
  const sorted = [...regions].sort((a, b) => a.top - b.top);
  const merged: TextRegion[] = [];

  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Check if regions are close enough to merge (vertically)
    const currentBottom = current.top + current.height;
    const gap = next.top - currentBottom;

    if (gap < threshold) {
      // Merge: expand current to include next
      const newLeft = Math.min(current.left, next.left);
      const newTop = Math.min(current.top, next.top);
      const newRight = Math.max(current.left + current.width, next.left + next.width);
      const newBottom = Math.max(currentBottom, next.top + next.height);

      current = {
        left: newLeft,
        top: newTop,
        width: newRight - newLeft,
        height: newBottom - newTop,
        text: current.text + " " + next.text,
        confidence: (current.confidence + next.confidence) / 2,
      };
    } else {
      // No merge, push current and start new
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}
