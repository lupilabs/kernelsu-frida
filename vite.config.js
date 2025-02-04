// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // Tell Vite that your actual source files (like index.html and src folder) are in the 'webroot' directory.
  root: 'webroot',
  build: {
    // Set the build output directory relative to the project root.
    outDir: '../dist',
    // This ensures the output directory is emptied before each build.
    emptyOutDir: true,
  },
});
