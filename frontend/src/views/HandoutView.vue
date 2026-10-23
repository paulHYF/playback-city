<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { marked } from 'marked'
import { api } from '@/api'
import type { Game } from '@/types/game'
import { fmt } from '@/utils'

const props = defineProps<{ id: string }>()
const game = ref<Game>()
const error = ref('')
const html = computed(() => (game.value ? (marked.parse(game.value.handout.markdown) as string) : ''))

onMounted(async () => {
  try {
    game.value = await api.replayGame(props.id)
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>

<template>
  <main class="handout">
    <RouterLink to="/" class="muted">← 回放不夜城</RouterLink>
    <p v-if="error" class="error">{{ error }}</p>
    <template v-if="game">
      <article class="paper" v-html="html" />
      <section v-if="game.pairs.length" class="paper">
        <h2>易混辨析</h2>
        <dl v-for="p in game.pairs" :key="p.a + p.b">
          <dt>{{ p.a }} ／ {{ p.b }} <span class="muted">回放 {{ fmt(p.source_time) }}</span></dt>
          <dd>{{ p.diff }}</dd>
        </dl>
      </section>
      <section v-if="game.faq.length" class="paper">
        <h2>高频问题</h2>
        <dl v-for="f in game.faq" :key="f.question">
          <dt>{{ f.question }} <span class="muted">{{ f.count }} 人问过 · 回放 {{ fmt(f.source_time) }}</span></dt>
          <dd>{{ f.answer }}</dd>
        </dl>
      </section>
    </template>
  </main>
</template>

<style scoped>
.handout { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
.paper { background: #f3ecdc; color: #2b2620; border-radius: 4px; padding: 28px 32px; margin-top: 16px; font-family: var(--serif); line-height: 1.8; }
.paper :deep(h1), .paper h2 { font-family: var(--brush); font-weight: 400; color: #8e2f22; }
.paper .muted { color: #8a7f6c; font-size: 12px; font-family: var(--body); }
dt { font-weight: 600; margin-top: 12px; }
dd { margin: 4px 0 0; }
.error { color: var(--cinnabar); }
@media (max-width: 600px) { .paper { padding: 20px 16px; } }
</style>
