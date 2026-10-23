<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMenu, ElMenuItem, ElTag } from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import { api } from '@/api'

const health = ref<Awaited<ReturnType<typeof api.health>>>()
onMounted(async () => {
  document.documentElement.classList.add('dark')
  health.value = await api.health().catch(() => undefined)
})
</script>

<template>
  <div class="admin">
    <aside>
      <RouterLink to="/" class="brand brush">回放不夜城</RouterLink>
      <ElMenu router :default-active="'/admin/channels'">
        <ElMenuItem index="/admin/channels">频道导入</ElMenuItem>
      </ElMenu>
      <div class="status">
        <template v-if="health">
          <ElTag :type="health.polyvReady ? 'success' : 'danger'" size="small">POLYV</ElTag>
          <ElTag :type="health.llmReady ? 'success' : 'danger'" size="small">大模型</ElTag>
          <p class="muted mono">{{ health.polyv }}</p>
        </template>
        <ElTag v-else type="danger" size="small">服务端未启动</ElTag>
      </div>
    </aside>
    <main><RouterView /></main>
  </div>
</template>

<style scoped>
.admin { display: grid; grid-template-columns: 200px minmax(0, 1fr); min-height: 100vh; }
aside { border-right: 1px solid var(--line); background: var(--panel); display: flex; flex-direction: column; }
.brand { display: block; padding: 18px 20px; font-size: 26px; text-decoration: none; }
.status { margin-top: auto; padding: 16px 20px; display: flex; flex-wrap: wrap; gap: 6px; }
.status p { font-size: 11px; margin: 4px 0 0; word-break: break-all; }
main { padding: 24px; min-width: 0; }
@media (max-width: 720px) { .admin { grid-template-columns: 1fr; } aside { border-right: 0; border-bottom: 1px solid var(--line); } }
</style>
