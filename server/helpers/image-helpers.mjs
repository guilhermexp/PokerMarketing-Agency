/**
 * Helper: Convert URL or data URL to base64 string
 * - If already base64 or data URL, extracts the base64 part
 * - If HTTP URL, fetches the image and converts to base64
 */
export async function urlToBase64(input) {
  if (!input) return null;

  // Already base64 (no prefix)
  if (!input.startsWith("data:") && !input.startsWith("http")) {
    return input;
  }

  // Data URL - extract base64 part
  if (input.startsWith("data:")) {
    return input.split(",")[1];
  }

  // HTTP URL - fetch and convert
  if (input.startsWith("http")) {
    try {
      const response = await fetch(input);
      if (!response.ok) {
        console.error(
          `[urlToBase64] Failed to fetch ${input}: ${response.status}`,
        );
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return base64;
    } catch (error) {
      console.error(`[urlToBase64] Error fetching ${input}:`, error.message);
      return null;
    }
  }

  return input;
}
