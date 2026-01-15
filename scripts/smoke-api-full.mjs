/**
 * Full API smoke test runner.
 *
 * Usage:
 *   USER_ID=... ORG_ID=... node scripts/smoke-api-full.mjs
 */

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3002";
const USER_ID = process.env.USER_ID;
const ORG_ID = process.env.ORG_ID;

if (!USER_ID || !ORG_ID) {
  console.error("Missing USER_ID or ORG_ID in env.");
  process.exit(1);
}

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X3T7cAAAAASUVORK5CYII=";

const headers = { "Content-Type": "application/json" };

const request = async (method, path, body) => {
  const url = `${BASE_URL}${path}`;
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
};

const printResult = (name, result) => {
  const status = result.ok ? "OK" : "FAIL";
  console.log(`${status} ${name} -> ${result.status}`);
  if (!result.ok && result.text) {
    console.log(`  Error: ${result.text.slice(0, 200)}`);
  }
};

const buildBrandProfile = (row) => {
  if (!row) return null;
  return {
    name: row.name,
    description: row.description,
    logo: row.logo_url ?? row.logo ?? null,
    primaryColor: row.primary_color ?? row.primaryColor,
    secondaryColor: row.secondary_color ?? row.secondaryColor,
    tertiaryColor: row.tertiary_color ?? row.tertiaryColor,
    toneOfVoice: row.tone_of_voice ?? row.toneOfVoice,
    creativeModel: row.settings?.creativeModel ?? row.creativeModel,
  };
};

const run = async () => {
  const qs = `?user_id=${encodeURIComponent(USER_ID)}&organization_id=${encodeURIComponent(ORG_ID)}`;

  const health = await request("GET", "/api/db/health");
  printResult("db/health", health);

  const init = await request("GET", `/api/db/init${qs}`);
  printResult("db/init", init);

  const brandRes = await request("GET", `/api/db/brand-profiles${qs}`);
  printResult("db/brand-profiles", brandRes);
  const brandProfile = buildBrandProfile(brandRes.json);

  const gallery = await request("GET", `/api/db/gallery${qs}`);
  printResult("db/gallery", gallery);

  const scheduledPosts = await request("GET", `/api/db/scheduled-posts${qs}`);
  printResult("db/scheduled-posts", scheduledPosts);

  const campaigns = await request("GET", `/api/db/campaigns${qs}`);
  printResult("db/campaigns", campaigns);

  const schedules = await request("GET", `/api/db/tournaments/list${qs}`);
  printResult("db/tournaments/list", schedules);
  const scheduleId = schedules.json?.[0]?.id;
  if (scheduleId) {
    const tournaments = await request(
      "GET",
      `/api/db/tournaments${qs}&week_schedule_id=${encodeURIComponent(scheduleId)}`,
    );
    printResult("db/tournaments", tournaments);
  } else {
    console.log("SKIP db/tournaments -> no schedules found");
  }

  const igAccounts = await request("GET", `/api/db/instagram-accounts${qs}`);
  printResult("db/instagram-accounts", igAccounts);

  const status = await request(
    "GET",
    `/api/generate/status?userId=${encodeURIComponent(USER_ID)}&organizationId=${encodeURIComponent(ORG_ID)}&limit=5`,
  );
  printResult("generate/status", status);

  const upload = await request("POST", "/api/upload", {
    filename: "tiny.png",
    contentType: "image/png",
    data: tinyPngBase64,
  });
  printResult("upload", upload);
  const uploadUrl = upload.json?.url;

  if (!brandProfile) {
    console.log("SKIP AI calls -> brandProfile not found");
    return;
  }

  const aiText = await request("POST", "/api/ai/text", {
    type: "quickPost",
    brandProfile,
    context: "Teste rapido de post",
  });
  printResult("ai/text", aiText);

  const convertPrompt = await request("POST", "/api/ai/convert-prompt", {
    prompt: "Video curto sobre torneio de poker",
    duration: 3,
    aspectRatio: "9:16",
  });
  printResult("ai/convert-prompt", convertPrompt);

  const enhance = await request("POST", "/api/ai/enhance-prompt", {
    prompt: "Campanha de poker premium para o fim de semana",
    brandProfile,
  });
  printResult("ai/enhance-prompt", enhance);

  const aiImage = await request("POST", "/api/ai/image", {
    prompt: "Mesa de poker elegante com luzes douradas",
    brandProfile,
    aspectRatio: "1:1",
    imageSize: "1K",
  });
  printResult("ai/image", aiImage);

  const aiFlyer = await request("POST", "/api/ai/flyer", {
    prompt: "Torneio especial - buy-in R$ 200, premiação garantida",
    brandProfile,
    aspectRatio: "9:16",
    imageSize: "1K",
  });
  printResult("ai/flyer", aiFlyer);

  const aiEdit = await request("POST", "/api/ai/edit-image", {
    image: { base64: tinyPngBase64, mimeType: "image/png" },
    prompt: "Adicionar brilho dourado",
  });
  printResult("ai/edit-image", aiEdit);

  const extractColors = await request("POST", "/api/ai/extract-colors", {
    logo: { base64: tinyPngBase64, mimeType: "image/png" },
  });
  printResult("ai/extract-colors", extractColors);

  const speech = await request("POST", "/api/ai/speech", {
    script: "Teste rapido de voz para anuncio de poker.",
    voiceName: "Orus",
  });
  printResult("ai/speech", speech);

  const assistant = await request("POST", "/api/ai/assistant", {
    history: [{ role: "user", parts: [{ text: "Oi, gere uma ideia de post." }] }],
    brandProfile,
  });
  printResult("ai/assistant", assistant);

  const aiVideo = await request("POST", "/api/ai/video", {
    prompt: "Fichas de poker caindo em slow motion",
    aspectRatio: "9:16",
    model: "veo-3.1-fast-generate-preview",
    imageUrl: uploadUrl,
    sceneDuration: 3,
  });
  printResult("ai/video", aiVideo);

  const aiCampaign = await request("POST", "/api/ai/campaign", {
    brandProfile,
    transcript: "Evento especial de poker com premios altos neste fim de semana.",
    options: {
      videoClipScripts: { generate: true, count: 1 },
      posts: {
        instagram: { generate: true, count: 1 },
        facebook: { generate: false, count: 0 },
        twitter: { generate: false, count: 0 },
        linkedin: { generate: false, count: 0 },
      },
      adCreatives: {
        facebook: { generate: true, count: 1 },
        google: { generate: false, count: 0 },
      },
      carousels: { generate: true, count: 1 },
    },
  });
  printResult("ai/campaign", aiCampaign);

  const adminStats = await request("GET", "/api/admin/stats");
  printResult("admin/stats", adminStats);
  const adminUsage = await request("GET", "/api/admin/usage");
  printResult("admin/usage", adminUsage);
  const adminUsers = await request("GET", "/api/admin/users");
  printResult("admin/users", adminUsers);
  const adminOrgs = await request("GET", "/api/admin/organizations");
  printResult("admin/organizations", adminOrgs);
  const adminLogs = await request("GET", "/api/admin/logs");
  printResult("admin/logs", adminLogs);
};

run().catch((error) => {
  console.error("[smoke-api-full] Failed:", error);
  process.exit(1);
});
