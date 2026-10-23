<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElEmpty, ElInput, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { api } from '@/api'
import type { PlayEvent, PlayViewerDetail, PlayViewerRow } from '@/types/city'
import { fmt } from '@/utils'

const props = defineProps<{ cid: string }>()
const route = useRoute()
const router = useRouter()

const rows = ref<PlayViewerRow[]>([])
const keyword = ref('')
const error = ref('')
const loading = ref(false)
const detail = ref<PlayViewerDetail>()
const openRun = ref('')

const RESULT: Record<string, [string, 'success' | 'warning' | 'info' | 'danger']> = {
  cleared: ['通关', 'success'], dawn: ['天亮', 'warning'], abandoned: ['弃局', 'info'], playing: ['进行中', 'danger']
}
const EVENT: Record<string, string> = {
  enter_palace: '进地宫', enter_room: '进室', answer: '作答', fall: '倒下', revive_watch: '复活回看',
  npc_talk: '对话', tool_get: '得道具', room_done: '破室', boss_win: '破惑', clear: '通关', watch_replay: '看回放'
}

const filtered = computed(() => {
  const k = keyword.value.trim()
  return k ? rows.value.filter(r => r.nickname.includes(k)) : rows.value
})

const fmtAt = (ts: number | null | undefined) => (ts ? new Date(ts).toLocaleString('zh-CN') : '—')
const eventLine = (e: PlayEvent) => {
  const bits = [EVENT[e.type] || e.type]
  if (e.room != null) bits.push(`第 ${e.room + 1} 室`)
  if (e.type === 'answer') bits.push(e.correct ? '答对' : '答错', e.choice ? `选「${e.choice}」` : '')
  if (e.type === 'revive_watch' && e.extra.seconds) bits.push(`${e.extra.seconds} 秒`)
  return bits.filter(Boolean).join(' · ')
}

async function load() {
  loading.value = true
  try {
    rows.value = (await api.playViewers(props.cid)).viewers
    error.value = ''
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function open(vid: string) {
  openRun.value = ''
  try {
    detail.value = await api.playViewer(props.cid, vid)
    if (detail.value.runs[0]) openRun.value = detail.value.runs[0].id
    if (route.query.vid !== vid) router.replace({ query: { vid } })
  } catch (e) {
    error.value = (e as Error).message
  }
}

onMounted(async () => {
  await load()
  const vid = typeof route.query.vid === 'string' ? route.query.vid : ''
  if (vid) await open(vid)
})
watch(() => route.query.vid, vid => {
  if (typeof vid === 'string' && vid && detail.value?.viewer.id !== vid) open(vid)
})
</script>

<template>
  <p class="muted"><RouterLink :to="`/admin/channels/${cid}`">← 回放基础信息</RouterLink></p>
  <h2>观众闯关数据</h2>
  <p class="muted">观众进游戏会自动领一个「夜巡人·xxxx」昵称。这里看本城每一位观众打了几局、通没通关、每一局里做了什么。讲师大盘点观众也会进这一页。</p>
  <p v-if="error" class="error">{{ error }}</p>

  <div class="toolbar">
    <ElInput v-model="keyword" placeholder="搜昵称" clearable style="width: 220px" />
    <span class="muted small">{{ filtered.length }} 人</span>
  </div>

  <ElTable :data="filtered" v-loading="loading" empty-text="这座城还没有观众来闯关" highlight-current-row
           :row-class-name="({ row }: { row: PlayViewerRow }) => (row.id === detail?.viewer.id ? 'on' : '')"
           @row-click="(row: PlayViewerRow) => open(row.id)">
    <ElTableColumn prop="nickname" label="昵称" min-width="140" />
    <ElTableColumn label="局数" width="80">
      <template #default="{ row }">{{ row.runs }}<span v-if="row.playing" class="muted"> · {{ row.playing }} 进行中</span></template>
    </ElTableColumn>
    <ElTableColumn prop="cleared" label="通关" width="70" />
    <ElTableColumn prop="points" label="积分" width="80" />
    <ElTableColumn label="最近一局" width="180">
      <template #default="{ row }">{{ fmtAt(row.last_run) }}</template>
    </ElTableColumn>
    <ElTableColumn label="首次进入" width="180">
      <template #default="{ row }">{{ fmtAt(row.first_seen) }}</template>
    </ElTableColumn>
  </ElTable>

  <section v-if="detail" class="detail">
    <header>
      <h3>{{ detail.viewer.nickname }}</h3>
      <p class="muted small">观众 {{ detail.viewer.id }} · 首次 {{ fmtAt(detail.viewer.first_seen) }} · 最近 {{ fmtAt(detail.viewer.last_seen) }} · {{ detail.runs.length }} 局</p>
    </header>
    <ElEmpty v-if="!detail.runs.length" description="这个观众在本城还没有闯关局" />
    <div v-for="run in detail.runs" :key="run.id" class="run">
      <button type="button" class="run-head" @click="openRun = openRun === run.id ? '' : run.id">
        <span>第 {{ run.sort_no }} 讲 · {{ run.replay_title }}</span>
        <ElTag :type="(RESULT[run.result] || RESULT.playing)[1]" size="small">{{ (RESULT[run.result] || RESULT.playing)[0] }}</ElTag>
        <span class="muted small">{{ fmtAt(run.started_at) }} · 用时 {{ fmt(run.duration_s) }} · {{ run.points }} 分 · 对 {{ run.correct_cnt }} / 错 {{ run.wrong_cnt }} · 复活 {{ run.revive_cnt }}</span>
      </button>
      <ol v-if="openRun === run.id" class="events">
        <li v-for="(e, i) in run.events" :key="i">
          <span class="muted mono">{{ fmtAt(e.ts) }}</span>
          {{ eventLine(e) }}
        </li>
        <li v-if="!run.events.length" class="muted">这一局还没有上报事件。</li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
h2 { margin: 8px 0 4px; }
.toolbar { display: flex; align-items: center; gap: 12px; margin: 16px 0 12px; }
.small { font-size: 12px; }
.detail { margin-top: 28px; }
.detail h3 { margin: 0; font-family: var(--serif); font-size: 22px; }
.run { border: 1px solid var(--line); border-radius: 4px; margin-top: 10px; background: var(--panel); }
.run-head { width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 14px; background: none; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.events { margin: 0; padding: 0 16px 12px 36px; display: grid; gap: 4px; font-size: 13px; }
.events .mono { margin-right: 8px; font-size: 12px; }
:deep(.el-table .on) { --el-table-tr-bg-color: var(--panel-2); }
.error { color: var(--cinnabar); }
</style>
