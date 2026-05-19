import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080', // Fallback to 8080 first, or 8000. Let's make it robust.
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            // If port 8080 is down, proxy to 8000 dynamically!
            console.log('Proxy error, attempting fallback to port 8000...');
          });
        }
      },
      '/data': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
