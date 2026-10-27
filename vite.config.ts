import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Production builds get a strict Content-Security-Policy: the app may only
 * load its own files and never talks to the network. Left out of the dev
 * server, whose hot-reload client needs inline scripts.
 */
const contentSecurityPolicy: Plugin = {
  name: 'trip-ledger-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    );
  },
};

export default defineConfig({
  // Relative paths so the same bundle loads from file:// (Electron) and
  // https://localhost (Capacitor).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Shown in Settings so test builds that share a version can be told apart.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [contentSecurityPolicy],
  server: {
    port: 5180,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
