<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElButton, ElCollapse, ElCollapseItem, ElTag } from 'element-plus'
import { api } from '@/api'
import type { Game } from '@/types/game'
import { fmt } from '@/utils'

const props = defineProps<{ id: string }>()
const game = ref<Game>()
onMounted(async () => (game.value = await api.replayGame(props.id)))
</script>

<template>
  <template v-if="game">
    <h2>{{ game.replay.title }}</h2>
    <p class="muted">
      {{ game.rooms.length }} 间殿室 · {{ game.rooms.reduce((n, r) => n + r.items.length, 0) }} 道题 ·
      {{ game.faq.length }} 条高频问题 · {{ game.pairs.length }} 组易混
    </p>
    <div class="bar">
      <RouterLink :to="`/admin/channels/${game.replay.channelId}`"><ElButton>← 回放基础信息</ElButton></RouterLink>
      <RouterLink :to="`/city/${game.replay.channelId}`"><ElButton type="primary">进城试玩</ElButton></RouterLink>
      <RouterLink :to="`/handout/${id}`"><ElButton>讲义</ElButton></RouterLink>
    </div>
    <ElCollapse>
      <ElCollapseItem v-for="(r, i) in game.rooms" :key="i" :name="i">
        <template #title>
          {{ i + 1 }}. {{ r.title }}
          <span class="muted mono">&nbsp;{{ fmt(r.start) }}–{{ fmt(r.end) }}</span>
          <ElTag v-if="i === game.boss_room" type="danger" size="small" class="tag">Boss</ElTag>
          <ElTag v-if="r.watched_ratio < 0.5" type="info" size="small" class="tag">墨雾</ElTag>
          <span class="muted">&nbsp;错误率 {{ Math.round(r.fail_rate * 100) }}%</span>
        </template>
        <p>{{ r.summary }}</p>
        <ol>
          <li v-for="it in r.items" :key="it.id">
            <b>{{ it.keyword }}</b>：{{ it.question }}
            <pre v-if="it.code">{{ it.code }}</pre>
            <div class="muted">答案 {{ it.options[0] }} · 原话「{{ it.source_quote }}」{{ fmt(it.source_time) }}</div>
          </li>
        </ol>
      </ElCollapseItem>
    </ElCollapse>
  </template>
</template>

<style scoped>
h2 { margin: 0; }
.bar { display: flex; gap: 8px; margin: 12px 0 20px; }
.tag { margin-left: 8px; }
pre { background: var(--panel-2); padding: 8px; border-radius: 3px; font-size: 12px; }
li { margin-bottom: 10px; }
</style>
