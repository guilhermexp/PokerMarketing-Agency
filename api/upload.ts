/**
 * Vercel Serverless Function - File Upload to Vercel Blob
 * Handles uploads of videos, audios, and other media files
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';

// Max file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filename, contentType, data } = req.body;

    if (!filename || !contentType || !data) {
      return res.status(400).json({ error: 'Missing required fields: filename, contentType, data' });
    }

    // Decode base64 data
    const buffer = Buffer.from(data, 'base64');

    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;

    // Upload to Vercel Blob
    const blob = await put(uniqueFilename, buffer, {
      access: 'public',
      contentType,
    });

    console.log('[Upload] File uploaded:', blob.url);

    return res.status(200).json({
      success: true,
      url: blob.url,
      filename: uniqueFilename,
      size: buffer.length,
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
