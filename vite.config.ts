import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
        'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
        'import.meta.env.WP_BASE_URL': JSON.stringify(env.WP_BASE_URL),
        'import.meta.env.WP_USERNAME': JSON.stringify(env.WP_USERNAME),
        'import.meta.env.WP_APP_PASSWORD': JSON.stringify(env.WP_APP_PASSWORD)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
