import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        menu: fileURLToPath(new URL('./index.html', import.meta.url)),
        tracker: fileURLToPath(new URL('./tracker.html', import.meta.url)),
        home: fileURLToPath(new URL('./home.html', import.meta.url)),
        play: fileURLToPath(new URL('./play.html', import.meta.url)),
        settings: fileURLToPath(new URL('./settings.html', import.meta.url)),
      },
    },
  },
});
