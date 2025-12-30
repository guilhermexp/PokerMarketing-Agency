/**
 * Vercel Serverless Function - Video Proxy
 * Proxies Vercel Blob videos with proper COEP headers for FFmpeg WASM
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    // Only allow proxying Vercel Blob URLs for security
    if (
      !url.includes('.public.blob.vercel-storage.com/') &&
      !url.includes('.blob.vercel-storage.com/')
    ) {
      return res.status(403).json({ error: 'Only Vercel Blob URLs are allowed' });
    }

    console.log('[Video Proxy] Fetching:', url);

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch video: ${response.statusText}`,
      });
    }

    // Set CORS and COEP-compatible headers
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    res.setHeader('Accept-Ranges', 'bytes');

    // Handle range requests for video seeking
    const range = req.headers.range;
    if (range && contentLength) {
      const contentLengthNum = parseInt(contentLength);
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : contentLengthNum - 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${contentLengthNum}`);
      res.setHeader('Content-Length', end - start + 1);
    }

    // Stream the video data
    const buffer = await response.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('[Video Proxy] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
