import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import jsconfigPaths from 'vite-jsconfig-paths';
import { fileURLToPath } from 'url';
import path from 'path';

const resolvePath = (str) => path.resolve(__dirname, str);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const API_URL = `${env.VITE_APP_BASE_NAME}`;
  const PORT = 3000;

  return {
    server: {
      // this ensures that the browser opens upon server start
      open: false,
      // this sets a default port to 3000
      port: PORT,
      host: true,
      allowedHosts: true,

      proxy: {
        '/api': {
          // Docker magic: use the service name 'backend' instead of localhost!
          target: 'http://backend:8000', // FastAPI address
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    preview: {
      open: false,
      host: true
    },
    define: {
      global: 'window'
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          charset: false,
          verbose: true,
          quietDeps: true,
          silenceDeprecations: ['import']
        },
        less: {
          charset: false
        }
      },
      charset: false,
      postcss: {
        plugins: [
          {
            postcssPlugin: 'internal:charset-removal',
            AtRule: {
              charset: (atRule) => {
                if (atRule.name === 'charset') {
                  atRule.remove();
                }
              }
            }
          }
        ]
      }
    },
    build: {
      chunkSizeWarningLimit: 1600,
      sourcemap: true,
      cssCodeSplit: true,
      rollupOptions: {
        input: {
          main: resolvePath('index.html'),
          legacy: resolvePath('index.html')
        }
      }
    },
    base: '/',
    plugins: [react(), jsconfigPaths()]
  };
});
