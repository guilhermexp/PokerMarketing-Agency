/**
 * Vercel Serverless Function entry point.
 *
 * Imports the Express app (with all middleware + routes) and
 * registers the final error handlers. Vercel invokes the default
 * export for every request matched by the rewrite in vercel.json.
 */

import app, { finalizeApp } from "../server/app.mjs";

// Finalize: register notFoundHandler + errorHandler
finalizeApp();

export default app;
