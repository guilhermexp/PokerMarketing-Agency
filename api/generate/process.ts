/**
 * Process Generation Job API - QStash Callback
 * Called by QStash to execute the actual image generation
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Receiver } from '@upstash/qstash';
import { GoogleGenAI } from '@google/genai';
import { put } from '@vercel/blob';
import { getSql } from '../db/_helpers/index';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize QStash Receiver for signature verification
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});

function getAi() {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

const mapAspectRatio = (ratio: string): string => {
  const map: Record<string, string> = {
    '1:1': '1:1', '9:16': '9:16', '16:9': '16:9',
    '1.91:1': '16:9', '4:5': '4:5', '3:4': '3:4',
    '4:3': '4:3', '2:3': '2:3', '3:2': '3:2'
  };
  return map[ratio] || '1:1';
};

// Generate flyer using Gemini
async function generateFlyer(
  prompt: string,
  config: any
): Promise<string> {
  const ai = getAi();

  const brandingInstruction = `
  **PERSONA:** Você é Diretor de Arte Sênior de uma agência de publicidade internacional de elite especializada em iGaming e Poker.

  **MISSÃO CRÍTICA (NÃO PULE ESTA REGRA):**
  Todo torneio de poker é definido pelo seu VALOR GARANTIDO (GTD).
  Você DEVE escrever o valor do **GARANTIDO (GTD)** em cada item da lista.
  O GTD deve estar em destaque visual (fonte negrito, cor vibrante ou tamanho maior).

  **REGRAS DE CONTEÚDO:**
  1. Se o prompt fornecer um valor de "GTD", ele deve aparecer obrigatoriamente.
  2. O Horário e o Nome do Torneio devem estar perfeitamente legíveis.
  3. Use a marca ${config.brandName}.

  **IDENTIDADE DA MARCA - ${config.brandName}:**
  - Tom de Comunicação: ${config.brandToneOfVoice}
  - Cor Primária (dominante): ${config.brandPrimaryColor}
  - Cor de Acento (destaques, GTD, CTAs): ${config.brandSecondaryColor}

  **PRINCÍPIOS DE DESIGN PROFISSIONAL:**

  1. HARMONIA CROMÁTICA:
     - Use APENAS as cores da marca: ${config.brandPrimaryColor} (primária) e ${config.brandSecondaryColor} (acento)
     - Crie variações tonais dessas cores para profundidade
     - Gradientes sutis entre tons da mesma cor são bem-vindos

  2. RESPIRAÇÃO VISUAL:
     - Menos é mais: priorize espaços negativos estratégicos
     - Hierarquia visual clara: 1 elemento principal, 2-3 secundários

  3. TIPOGRAFIA CINEMATOGRÁFICA:
     - Máximo 2-3 famílias tipográficas
     - Contraste forte entre títulos (bold) e corpo (regular)

  4. COMPOSIÇÃO CINEMATOGRÁFICA:
     - Regra dos terços ou composição centralizada
     - Profundidade através de camadas
     - Iluminação direcionada

  5. ESTÉTICA PREMIUM:
     - Elegância sutil, não ostentação
     - Qualidade de marca luxury

  **ATMOSFERA FINAL:**
  - Poker de alta classe, luxo e sofisticação
  - Cinematográfico mas não exagerado
  - Profissional mas criativo
  `;

  const parts: any[] = [
    { text: brandingInstruction },
    { text: `DADOS DO FLYER PARA INSERIR NA ARTE:\n${prompt}` }
  ];

  // Add logo if provided
  if (config.logo) {
    const logoData = config.logo.startsWith('data:')
      ? config.logo.split(',')[1]
      : config.logo;
    parts.push({ inlineData: { data: logoData, mimeType: 'image/png' } });
  }

  // Add collab logo if provided
  if (config.collabLogo) {
    const collabData = config.collabLogo.startsWith('data:')
      ? config.collabLogo.split(',')[1]
      : config.collabLogo;
    parts.push({ inlineData: { data: collabData, mimeType: 'image/png' } });
  }

  // Add style reference if provided
  if (config.styleReference) {
    parts.push({ text: "USE ESTA IMAGEM COMO REFERÊNCIA DE LAYOUT E FONTES:" });
    const refData = config.styleReference.startsWith('data:')
      ? config.styleReference.split(',')[1]
      : config.styleReference;
    parts.push({ inlineData: { data: refData, mimeType: 'image/png' } });
  }

  // Add composition assets
  if (config.compositionAssets && config.compositionAssets.length > 0) {
    config.compositionAssets.forEach((asset: string, i: number) => {
      parts.push({ text: `Ativo de composição ${i + 1}:` });
      const assetData = asset.startsWith('data:') ? asset.split(',')[1] : asset;
      parts.push({ inlineData: { data: assetData, mimeType: 'image/png' } });
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: mapAspectRatio(config.aspectRatio) as any,
        imageSize: config.imageSize || '1K'
      }
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error('AI failed to generate image');
}

// Upload base64 image to Vercel Blob
async function uploadToBlob(dataUrl: string, jobId: string): Promise<string> {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid data URL');

  const [, mimeType, base64Data] = matches;
  const buffer = Buffer.from(base64Data, 'base64');
  const extension = mimeType.split('/')[1] || 'png';

  const blob = await put(`generated/${jobId}.${extension}`, buffer, {
    access: 'public',
    contentType: mimeType,
  });

  return blob.url;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify QStash signature
  const signature = req.headers['upstash-signature'] as string;
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  try {
    if (process.env.QSTASH_CURRENT_SIGNING_KEY) {
      await receiver.verify({
        signature,
        body,
        url: `https://${req.headers.host}${req.url}`,
      });
    }
  } catch (e) {
    console.error('[Generate Process] Signature verification failed:', e);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (!process.env.DATABASE_URL || !GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  const sql = getSql();
  let jobId: string | null = null;

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    jobId = payload.jobId;

    if (!jobId) {
      return res.status(400).json({ error: 'Missing jobId' });
    }

    console.log(`[Generate Process] Starting job ${jobId}`);

    // Get job from database
    const jobs = await sql`
      SELECT * FROM generation_jobs WHERE id = ${jobId} LIMIT 1
    `;

    if (jobs.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobs[0];

    // Check if already processed
    if (job.status === 'completed' || job.status === 'failed') {
      return res.status(200).json({
        success: true,
        message: `Job already ${job.status}`,
        jobId
      });
    }

    // Mark as processing
    const now = Math.floor(Date.now() / 1000);
    await sql`
      UPDATE generation_jobs
      SET status = 'processing',
          started_at = to_timestamp(${now}),
          attempts = COALESCE(attempts, 0) + 1
      WHERE id = ${jobId}
    `;

    // Parse config
    const config = typeof job.config === 'string' ? JSON.parse(job.config) : job.config;

    // Generate the image
    console.log(`[Generate Process] Generating image for job ${jobId}`);
    const dataUrl = await generateFlyer(job.prompt, config);

    // Upload to Vercel Blob for persistence
    console.log(`[Generate Process] Uploading to blob for job ${jobId}`);
    const blobUrl = await uploadToBlob(dataUrl, jobId);

    // Save to gallery
    const galleryResult = await sql`
      INSERT INTO gallery_images (user_id, src_url, prompt, source, model, aspect_ratio, image_size)
      VALUES (${job.user_id}, ${blobUrl}, ${job.prompt}, ${config.source || 'Flyer'}, ${config.model || 'gemini-3-pro-image-preview'}, ${config.aspectRatio}, ${config.imageSize || '1K'})
      RETURNING id
    `;

    const galleryId = galleryResult[0]?.id;

    // Mark as completed
    const completedAt = Math.floor(Date.now() / 1000);
    await sql`
      UPDATE generation_jobs
      SET status = 'completed',
          result_url = ${blobUrl},
          result_gallery_id = ${galleryId},
          completed_at = to_timestamp(${completedAt}),
          progress = 100
      WHERE id = ${jobId}
    `;

    console.log(`[Generate Process] Completed job ${jobId}, gallery ID: ${galleryId}`);

    return res.status(200).json({
      success: true,
      jobId,
      resultUrl: blobUrl,
      galleryId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Generate Process] Error for job ${jobId}:`, errorMessage);

    // Update job as failed
    if (jobId) {
      try {
        await sql`
          UPDATE generation_jobs
          SET status = 'failed',
              error_message = ${errorMessage}
          WHERE id = ${jobId}
        `;
      } catch (e) {
        console.error('[Generate Process] Failed to update job status:', e);
      }
    }

    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
}
