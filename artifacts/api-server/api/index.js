// Vercel convention: any file under api/ becomes a serverless function.
// Plain JS (not .ts) deliberately — Vercel doesn't type-check .js files here,
// which sidesteps a moduleResolution:"bundler" vs. Node's strict runtime ESM
// resolver mismatch. Imports the esbuild-bundled output (produced by build.mjs,
// this project's "build" step), not the raw TS source — Node's ESM loader
// requires explicit file extensions and doesn't resolve directory imports the
// way a bundler does.
export { default } from "../dist/app.mjs";
