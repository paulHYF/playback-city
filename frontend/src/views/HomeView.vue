<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import type { ChannelSummary } from '@/types/city'
import { SCENE_NAME } from '@/utils'

const cities = ref<ChannelSummary[]>([])
const error = ref('')

onMounted(async () => {
  try {
    cities.value = (await api.channels()).filter(c => c.ready)
  } catch (e) {
    error.value = `服务端没有响应：${(e as Error).message}`
  }
})
</script>

<template>
  <main class="home">
    <header>
      <h1 class="brush">回放不夜城</h1>
      <p class="muted">每一个直播频道，都是一座可以走进去的城；每一讲回放，是城里的一座楼。</p>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="list">
      <article v-for="c in cities" :key="c.channel_id" class="card">
        <span class="tag">{{ SCENE_NAME[c.scene] }} · {{ c.ready }} {{ c.scene === 'commerce' ? '场' : '讲' }}可闯</span>
        <h2>{{ c.name }}</h2>
        <p class="muted mono">频道 {{ c.channel_id }}</p>
        <div class="actions">
          <RouterLink class="btn primary" :to="`/city/${c.channel_id}`">进城</RouterLink>
          <RouterLink class="btn" :to="`/dashboard/${c.channel_id}`">讲师大盘</RouterLink>
        </div>
      </article>
      <p v-if="!cities.length && !error" class="muted">还没有可以进的城，去 <RouterLink to="/admin">后台</RouterLink> 输入频道号导入。</p>
    </section>
    <footer class="muted"><RouterLink to="/admin">后台 · 频道导入</RouterLink></footer>
  </main>
</template>

<style scoped>
.home { max-width: 960px; margin: 0 auto; padding: 48px 16px; }
h1 { font-size: 56px; margin: 0; }
.list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 32px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 18px; display: grid; gap: 8px; }
.card h2 { margin: 0; font-family: var(--serif); font-size: 18px; line-height: 1.4; }
.card p { margin: 0; font-size: 13px; }
.tag { font-size: 12px; color: var(--gold); }
.actions { display: flex; gap: 8px; margin-top: 8px; }
.btn { padding: 7px 14px; border: 1px solid var(--line); border-radius: 3px; text-decoration: none; color: var(--text); font-size: 14px; }
.btn.primary { border-color: var(--gold); color: var(--gold-2); }
.error { color: var(--cinnabar); }
footer { margin-top: 48px; font-size: 13px; }
</style>
