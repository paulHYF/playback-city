import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: true, // 监听 0.0.0.0，局域网用本机 IP:5173 也能访问；/api 由这里代理到本机后端，后端不用对外开放
    port: 5173,
    proxy: { '/api': 'http://localhost:8000' }
  }
})
