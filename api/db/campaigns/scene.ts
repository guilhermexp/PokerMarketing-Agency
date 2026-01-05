/**
 * Vercel Serverless Function - Scene Image API
 * PATCH endpoint for updating scene image_url in video_clip_scripts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors } from '../_helpers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();

    // PATCH - Update scene image_url in scenes JSONB
    if (req.method === 'PATCH') {
      const { clip_id, scene_number } = req.query;
      const { image_url } = req.body;

      if (!clip_id || scene_number === undefined) {
        return res.status(400).json({ error: 'clip_id and scene_number are required' });
      }

      const sceneNum = parseInt(scene_number as string, 10);

      // Get current scenes
      const [clip] = await sql`
        SELECT scenes FROM video_clip_scripts WHERE id = ${clip_id as string}
      `;

      if (!clip) {
        return res.status(404).json({ error: 'Clip not found' });
      }

      // Update the specific scene with image_url
      const scenes = clip.scenes || [];
      const updatedScenes = scenes.map((scene: { sceneNumber?: number; scene?: number }) => {
        // Handle both 'sceneNumber' and 'scene' property names
        const sceneNumber = scene.sceneNumber ?? scene.scene;
        if (sceneNumber === sceneNum) {
          return { ...scene, image_url: image_url || null };
        }
        return scene;
      });

      // Save updated scenes back to database
      const result = await sql`
        UPDATE video_clip_scripts
        SET scenes = ${JSON.stringify(updatedScenes)}::jsonb,
            updated_at = NOW()
        WHERE id = ${clip_id as string}
        RETURNING *
      `;

      return res.status(200).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Scene Image API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
