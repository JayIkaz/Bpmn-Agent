---
name: SPA static hosting rewrites vs local preview
description: Why removing an artifact.toml catch-all SPA rewrite can't be verified locally with vite preview/serve
---

Removing the `[[services.production.rewrites]] from="/*" to="/index.html"` block from an
artifact's `artifact.toml` (done to fix "soft-404" SEO issues, so unknown URLs get a real
404 instead of the homepage shell) cannot be verified by running `vite preview` /
`pnpm run serve` locally and curling an unknown path.

**Why:** Vite's preview server has its own built-in SPA fallback (`appType: 'spa'` by
default) that serves `index.html` with a 200 for any unmatched path, completely independent
of the artifact.toml rewrites config. So curling an unknown path against `vite preview`
will show 200 even after the rewrite is correctly removed — that's Vite's dev tooling
behavior, not the actual Replit production static file server behavior.

**How to apply:** Trust the artifact.toml change itself (verified via
`verifyAndReplaceArtifactToml`) rather than trying to reproduce production 404 behavior
with local `vite preview`. If real verification is needed, it has to happen against an
actual deployed/published instance, not the local dev/preview server.
