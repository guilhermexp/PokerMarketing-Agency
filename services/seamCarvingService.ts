/**
 * Seam Carving Service
 * Content-aware image resizing algorithm
 *
 * Based on: https://trekhleb.dev/blog/2021/content-aware-image-resizing-in-javascript/
 * Reference: https://github.com/trekhleb/js-image-carver
 */

type Color = [number, number, number, number]; // RGBA
type EnergyMap = number[][];
type Seam = { x: number; y: number }[];
type ProtectionMask = boolean[][]; // true = protected, false = not protected

// Very high energy value to protect marked areas from removal
const PROTECTION_ENERGY = 1000000;

// Get pixel color at coordinates
function getPixel(img: ImageData, x: number, y: number): Color {
  const idx = (y * img.width + x) * 4;
  return [
    img.data[idx],     // R
    img.data[idx + 1], // G
    img.data[idx + 2], // B
    img.data[idx + 3], // A
  ];
}

// Calculate energy of a pixel based on color difference with neighbors
function getPixelEnergy(
  left: Color | null,
  middle: Color,
  right: Color | null
): number {
  let energy = 0;

  // Sum of squared differences with neighbors
  if (left) {
    energy += (left[0] - middle[0]) ** 2; // R
    energy += (left[1] - middle[1]) ** 2; // G
    energy += (left[2] - middle[2]) ** 2; // B
  }
  if (right) {
    energy += (right[0] - middle[0]) ** 2;
    energy += (right[1] - middle[1]) ** 2;
    energy += (right[2] - middle[2]) ** 2;
  }

  return Math.sqrt(energy);
}

// Calculate energy map for vertical seams (left-right neighbors)
function calculateEnergyMapVertical(
  img: ImageData,
  protectionMask?: ProtectionMask
): EnergyMap {
  const { width, height } = img;
  const energyMap: EnergyMap = [];

  for (let y = 0; y < height; y++) {
    energyMap[y] = [];
    for (let x = 0; x < width; x++) {
      const left = x > 0 ? getPixel(img, x - 1, y) : null;
      const middle = getPixel(img, x, y);
      const right = x < width - 1 ? getPixel(img, x + 1, y) : null;
      let energy = getPixelEnergy(left, middle, right);

      // Add protection energy if pixel is protected
      if (protectionMask && protectionMask[y] && protectionMask[y][x]) {
        energy += PROTECTION_ENERGY;
      }

      energyMap[y][x] = energy;
    }
  }

  return energyMap;
}

// Calculate energy map for horizontal seams (top-bottom neighbors)
function calculateEnergyMapHorizontal(
  img: ImageData,
  protectionMask?: ProtectionMask
): EnergyMap {
  const { width, height } = img;
  const energyMap: EnergyMap = [];

  for (let y = 0; y < height; y++) {
    energyMap[y] = [];
    for (let x = 0; x < width; x++) {
      const top = y > 0 ? getPixel(img, x, y - 1) : null;
      const middle = getPixel(img, x, y);
      const bottom = y < height - 1 ? getPixel(img, x, y + 1) : null;
      let energy = getPixelEnergy(top, middle, bottom);

      // Add protection energy if pixel is protected
      if (protectionMask && protectionMask[y] && protectionMask[y][x]) {
        energy += PROTECTION_ENERGY;
      }

      energyMap[y][x] = energy;
    }
  }

  return energyMap;
}

// Find lowest energy vertical seam (top to bottom)
function findLowEnergySeamVertical(energyMap: EnergyMap): Seam {
  const height = energyMap.length;
  const width = energyMap[0].length;

  // DP table: each cell has cumulative energy + pointer to previous cell
  const dp: { energy: number; prev: number | null }[][] = [];

  // Initialize first row
  dp[0] = energyMap[0].map((e) => ({ energy: e, prev: null }));

  // Fill DP table
  for (let y = 1; y < height; y++) {
    dp[y] = [];
    for (let x = 0; x < width; x++) {
      // Three candidates: diagonal-left, directly above, diagonal-right
      const candidates = [
        x > 0 ? dp[y - 1][x - 1].energy : Infinity,
        dp[y - 1][x].energy,
        x < width - 1 ? dp[y - 1][x + 1].energy : Infinity,
      ];
      const minEnergy = Math.min(...candidates);
      const minIdx = candidates.indexOf(minEnergy);
      const prevX = x + minIdx - 1;

      dp[y][x] = {
        energy: energyMap[y][x] + minEnergy,
        prev: prevX,
      };
    }
  }

  // Find minimum in last row
  let minX = 0;
  for (let x = 1; x < width; x++) {
    if (dp[height - 1][x].energy < dp[height - 1][minX].energy) {
      minX = x;
    }
  }

  // Reconstruct seam from bottom to top
  const seam: Seam = [];
  let x = minX;
  for (let y = height - 1; y >= 0; y--) {
    seam.unshift({ x, y });
    x = dp[y][x].prev ?? x;
  }

  return seam;
}

// Find lowest energy horizontal seam (left to right)
function findLowEnergySeamHorizontal(energyMap: EnergyMap): Seam {
  const height = energyMap.length;
  const width = energyMap[0].length;

  // DP table: each cell has cumulative energy + pointer to previous cell
  const dp: { energy: number; prev: number | null }[][] = [];

  // Initialize first column
  for (let y = 0; y < height; y++) {
    dp[y] = [];
    dp[y][0] = { energy: energyMap[y][0], prev: null };
  }

  // Fill DP table (left to right)
  for (let x = 1; x < width; x++) {
    for (let y = 0; y < height; y++) {
      // Three candidates: diagonal-up, directly left, diagonal-down
      const candidates = [
        y > 0 ? dp[y - 1][x - 1].energy : Infinity,
        dp[y][x - 1].energy,
        y < height - 1 ? dp[y + 1][x - 1].energy : Infinity,
      ];
      const minEnergy = Math.min(...candidates);
      const minIdx = candidates.indexOf(minEnergy);
      const prevY = y + minIdx - 1;

      dp[y][x] = {
        energy: energyMap[y][x] + minEnergy,
        prev: prevY,
      };
    }
  }

  // Find minimum in last column
  let minY = 0;
  for (let y = 1; y < height; y++) {
    if (dp[y][width - 1].energy < dp[minY][width - 1].energy) {
      minY = y;
    }
  }

  // Reconstruct seam from right to left
  const seam: Seam = [];
  let y = minY;
  for (let x = width - 1; x >= 0; x--) {
    seam.unshift({ x, y });
    y = dp[y][x].prev ?? y;
  }

  return seam;
}

// Delete vertical seam (reduces width by 1)
function deleteVerticalSeam(img: ImageData, seam: Seam): ImageData {
  const { width, height } = img;
  const newWidth = width - 1;
  const newData = new Uint8ClampedArray(newWidth * height * 4);

  for (let y = 0; y < height; y++) {
    const seamX = seam[y].x;
    let newX = 0;

    for (let x = 0; x < width; x++) {
      if (x === seamX) continue; // Skip seam pixel

      const srcIdx = (y * width + x) * 4;
      const dstIdx = (y * newWidth + newX) * 4;

      newData[dstIdx] = img.data[srcIdx]; // R
      newData[dstIdx + 1] = img.data[srcIdx + 1]; // G
      newData[dstIdx + 2] = img.data[srcIdx + 2]; // B
      newData[dstIdx + 3] = img.data[srcIdx + 3]; // A

      newX++;
    }
  }

  return new ImageData(newData, newWidth, height);
}

// Delete horizontal seam (reduces height by 1)
function deleteHorizontalSeam(img: ImageData, seam: Seam): ImageData {
  const { width, height } = img;
  const newHeight = height - 1;
  const newData = new Uint8ClampedArray(width * newHeight * 4);

  for (let x = 0; x < width; x++) {
    const seamY = seam[x].y;
    let newY = 0;

    for (let y = 0; y < height; y++) {
      if (y === seamY) continue; // Skip seam pixel

      const srcIdx = (y * width + x) * 4;
      const dstIdx = (newY * width + x) * 4;

      newData[dstIdx] = img.data[srcIdx]; // R
      newData[dstIdx + 1] = img.data[srcIdx + 1]; // G
      newData[dstIdx + 2] = img.data[srcIdx + 2]; // B
      newData[dstIdx + 3] = img.data[srcIdx + 3]; // A

      newY++;
    }
  }

  return new ImageData(newData, width, newHeight);
}

// Delete vertical seam from protection mask (reduces width by 1)
function deleteVerticalSeamFromMask(
  mask: ProtectionMask,
  seam: Seam
): ProtectionMask {
  const height = mask.length;
  const newMask: ProtectionMask = [];

  for (let y = 0; y < height; y++) {
    const seamX = seam[y].x;
    newMask[y] = [];
    let newX = 0;

    for (let x = 0; x < mask[y].length; x++) {
      if (x === seamX) continue;
      newMask[y][newX] = mask[y][x];
      newX++;
    }
  }

  return newMask;
}

// Delete horizontal seam from protection mask (reduces height by 1)
function deleteHorizontalSeamFromMask(
  mask: ProtectionMask,
  seam: Seam
): ProtectionMask {
  const width = mask[0]?.length || 0;
  const newMask: ProtectionMask = [];

  // Create a set of y coordinates to remove for each x
  const seamYByX: Map<number, number> = new Map();
  for (const point of seam) {
    seamYByX.set(point.x, point.y);
  }

  // Reconstruct mask without seam rows
  let newY = 0;
  for (let y = 0; y < mask.length; y++) {
    // Check if this row should be removed at any x
    // For horizontal seams, we need to remove different y for each x
    const newRow: boolean[] = [];
    let skipRow = true;

    for (let x = 0; x < width; x++) {
      const seamY = seamYByX.get(x);
      if (seamY !== y) {
        skipRow = false;
      }
    }

    if (skipRow) continue;

    // Copy row, skipping seam points
    for (let x = 0; x < width; x++) {
      const seamY = seamYByX.get(x);
      if (seamY === y) {
        // Skip this point, but we need to handle this differently
        // For horizontal seams, each column removes a different row
      }
      newRow[x] = mask[y]?.[x] || false;
    }
    newMask[newY] = newRow;
    newY++;
  }

  // Simpler approach: rebuild column by column
  const height = mask.length;
  const resultMask: ProtectionMask = [];
  const newHeight = height - 1;

  for (let y = 0; y < newHeight; y++) {
    resultMask[y] = [];
  }

  for (let x = 0; x < width; x++) {
    const seamY = seamYByX.get(x) ?? -1;
    let destY = 0;

    for (let y = 0; y < height; y++) {
      if (y === seamY) continue;
      if (destY < newHeight) {
        resultMask[destY][x] = mask[y]?.[x] || false;
        destY++;
      }
    }
  }

  return resultMask;
}

// Main function: resize image using seam carving
export async function resizeImageContentAware(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number,
  onProgress?: (percent: number) => void,
  protectionMask?: ProtectionMask
): Promise<ImageData> {
  let currentImage = imageData;
  let currentMask = protectionMask;
  const originalWidth = imageData.width;
  const originalHeight = imageData.height;

  // Calculate total seams to remove
  const widthDiff = originalWidth - targetWidth;
  const heightDiff = originalHeight - targetHeight;
  const totalSeams = Math.abs(widthDiff) + Math.abs(heightDiff);

  if (totalSeams === 0) {
    return imageData;
  }

  let seamsRemoved = 0;

  // Remove vertical seams (reduce width)
  if (widthDiff > 0) {
    for (let i = 0; i < widthDiff; i++) {
      const energyMap = calculateEnergyMapVertical(currentImage, currentMask);
      const seam = findLowEnergySeamVertical(energyMap);
      currentImage = deleteVerticalSeam(currentImage, seam);

      // Update protection mask if present
      if (currentMask) {
        currentMask = deleteVerticalSeamFromMask(currentMask, seam);
      }

      seamsRemoved++;
      if (onProgress) {
        onProgress(Math.round((seamsRemoved / totalSeams) * 100));
      }

      // Yield to UI thread every 10 seams
      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  // Remove horizontal seams (reduce height)
  if (heightDiff > 0) {
    for (let i = 0; i < heightDiff; i++) {
      const energyMap = calculateEnergyMapHorizontal(currentImage, currentMask);
      const seam = findLowEnergySeamHorizontal(energyMap);
      currentImage = deleteHorizontalSeam(currentImage, seam);

      // Update protection mask if present
      if (currentMask) {
        currentMask = deleteHorizontalSeamFromMask(currentMask, seam);
      }

      seamsRemoved++;
      if (onProgress) {
        onProgress(Math.round((seamsRemoved / totalSeams) * 100));
      }

      // Yield to UI thread every 10 seams
      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  return currentImage;
}

// Helper: Load image from URL and get ImageData
export async function loadImageData(imageUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(imageData);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });
}

// Helper: Convert ImageData to data URL
export function imageDataToDataUrl(
  imageData: ImageData,
  mimeType: string = "image/png"
): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL(mimeType);
}

// Helper: Convert ImageData to base64
export function imageDataToBase64(
  imageData: ImageData,
  mimeType: string = "image/png"
): { base64: string; mimeType: string } {
  const dataUrl = imageDataToDataUrl(imageData, mimeType);
  const base64 = dataUrl.split(",")[1];
  return { base64, mimeType };
}

// Helper: Create protection mask from canvas
export function createProtectionMaskFromCanvas(
  canvas: HTMLCanvasElement
): ProtectionMask | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  // Check if canvas has any drawing
  let hasDrawing = false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      hasDrawing = true;
      break;
    }
  }

  if (!hasDrawing) return null;

  // Create protection mask
  const mask: ProtectionMask = [];
  for (let y = 0; y < height; y++) {
    mask[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Consider pixel protected if alpha > 0 (any drawing)
      mask[y][x] = data[idx + 3] > 0;
    }
  }

  return mask;
}

// Export type for external use
export type { ProtectionMask };
