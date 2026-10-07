import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Adds a Content-Security-Policy to production builds (dev keeps Vite's HMR working). */
function contentSecurityPolicy(supabaseUrl) {
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : '';
  const supabaseSocket = supabaseOrigin.replace(/^https/, 'wss');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigin} ${supabaseSocket}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_SUPABASE_URL)],
    // Relative asset paths are required because Electron loads the app via file://
    base: './',
    build: {
      target: 'es2022',
      rollupOptions: {
        output: {
          // Stable vendor chunks cache well and keep page chunks small
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('lucide-react')) return 'icons';
            return 'vendor';
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
