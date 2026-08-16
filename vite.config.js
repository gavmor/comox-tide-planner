import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/comox-tide-planner/',
  plugins: [preact(), tailwindcss()],
})
