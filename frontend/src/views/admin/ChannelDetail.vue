<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElMessage, ElMessageBox, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { api } from '@/api'
import type { ChannelDetail, GameStatus, Replay } from '@/types/city'
import { fmt, SCENE_NAME } from '@/utils'
import CityEditor from './CityEditor.vue'
import { BUILDING_KIND } from './game/config'

const props = defineProps<{ cid: string }>()
const ch = ref<ChannelDetail>()
const error = ref('')
let timer: number | undefined
const editingCity = ref(false)

const STATUS: Record<GameStatus, [string, 'info' | 'warning' | 'success' | 'danger']> = {
  none: ['未生成', 'info'], fetching: ['拉取数据中', 'warning'], analyzing: ['AI 分析中', 'warning'], ready: ['已生成', 'success'], failed: ['失败', 'danger']
}
const busy = computed(() => !!ch.value && (ch.value.cityRunning || ch.value.city_status === 'generating' || ch.value.replays.some(r => r.running || r.game_status === 'fetching' || r.game_status === 'analyzing')))
const readyCount = computed(() => ch.value?.replays.filter(r => r.game_status === 'ready').length || 0)
const unit = computed(() => (ch.value?.scene === 'commerce' ? '场' : '讲'))
const buildingOf = (rid: string) => ch.value?.city_json?.buildings.find(b => b.replay === rid)

async function load() {
  try {
    ch.value = await api.channel(props.cid)
    error.value = ''
  } catch (e) {
    error.value = (e as Error).message
  }
  clearTimeout(timer)
  if (busy.value) timer = window.setTimeout(load, 3000) // 生成中每 3 秒刷新状态
}
onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))

const startDay = (s: string) => (s.length >= 12 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : s || '—')

async function act(fn: () => Promise<unknown>, ok: string) {
  try {
    await fn()
    ElMessage.success(ok)
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
  load()
}
/** 后台调整过的配置，重新生成会被 AI 新结果覆盖，先确认 */
const confirmOverwrite = (what: string) =>
  ElMessageBox.confirm(`${what}在后台调整过，重新生成会覆盖这些调整。继续？`, '覆盖后台调整', { type: 'warning' }).then(() => true, () => false)
async function generate(r: Replay) {
  if (r.game_edited_at && !(await confirmOverwrite(`「${r.title}」的密室配置`))) return
  act(() => api.generateReplay(r.id), `开始生成「${r.title}」，几分钟后完成`)
}
const outline = (r: Replay) => act(() => api.createOutline(props.cid, r.id), '已触发 AI 大纲与字幕，完成后点「重新导入」刷新')
const reimport = () => act(() => api.importChannel(props.cid, ch.value!.scene), '已刷新回放列表')
async function genCity() {
  if (ch.value!.city_edited_at && !(await confirmOverwrite('整城配置'))) return
  act(() => api.generateCity(props.cid), '开始生成整城')
}
</script>

<template>
  <p v-if="error" class="error">{{ error }}</p>
  <template v-if="ch">
    <header class="head">
      <img v-if="ch.cover_img" :src="ch.cover_img" alt="" class="cover" />
      <div class="info">
        <h2>{{ ch.name }}</h2>
        <p class="muted">频道 {{ ch.channel_id }} · {{ SCENE_NAME[ch.scene] }} · 主持人 {{ ch.publisher || '—' }} · {{ ch.replays.length }} {{ unit }}回放，已生成 {{ readyCount }}</p>
        <div class="bar">
          <ElButton @click="reimport">重新导入</ElButton>
          <ElButton type="primary" :disabled="!readyCount" :loading="ch.cityRunning || ch.city_status === 'generating'" @click="genCity">
            {{ ch.city_status === 'ready' ? '重新生成整城' : '生成整城' }}
          </ElButton>
          <RouterLink :to="`/city/${cid}`" target="_blank"><ElButton :disabled="!readyCount">进城（观众端）</ElButton></RouterLink>
          <RouterLink :to="`/dashboard/${cid}`" target="_blank"><ElButton :disabled="!readyCount">讲师助教大盘</ElButton></RouterLink>
          <RouterLink :to="`/admin/channels/${cid}/viewers`"><ElButton>观众闯关数据</ElButton></RouterLink>
          <RouterLink :to="`/admin/channels/${cid}/raw`"><ElButton>直播原始数据</ElButton></RouterLink>
          <RouterLink :to="`/admin/channels/${cid}/report`"><ElButton>直播质量报告</ElButton></RouterLink>
        </div>
      </div>
    </header>

    <section class="city">
      <div class="city-actions">
        <ElTag v-if="ch.city_edited_at" type="warning" size="small">后台调整于 {{ new Date(ch.city_edited_at).toLocaleString('zh-CN') }}</ElTag>
        <ElButton size="small" :disabled="!readyCount || ch.cityRunning || ch.city_status === 'generating'" @click="editingCity = true">调整整城配置</ElButton>
      </div>
      <template v-if="ch.city_json">
        <h3 class="brush">{{ ch.city_json.name }}</h3>
        <p>{{ ch.city_json.intro }}</p>
        <p class="muted small">街道：<span v-for="s in ch.city_json.streets" :key="s.name" class="street">{{ s.name }}（{{ s.replays.length }}）</span></p>
        <p v-if="ch.city_json.npcs.length" class="muted small">更夫：<span v-for="(n, i) in ch.city_json.npcs" :key="i" class="street">{{ n.name }}「{{ n.line }}」</span></p>
      </template>
      <p v-else class="muted small">还没生成整城：先生成至少一{{ unit }}，再点「生成整城」，AI 会给城、街道、每座楼起名题匾。没生成前进城按标题兜底。</p>
      <ElAlert v-if="ch.city_error" :title="ch.city_error" :type="ch.city_status === 'failed' ? 'error' : 'warning'" :closable="false" show-icon />
    </section>

    <ElTable :data="ch.replays" empty-text="这个频道还没有回放或暂存">
      <ElTableColumn label="讲次" width="64">
        <template #default="{ row }">{{ row.sort_no }}</template>
      </ElTableColumn>
      <ElTableColumn label="回放" min-width="280">
        <template #default="{ row }">
          <div class="replay">
            <img v-if="row.cover" :src="row.cover" alt="" />
            <div>
              <div class="title">{{ row.title }}</div>
              <div class="muted mono small">{{ row.id }}</div>
            </div>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="楼阁" width="150">
        <template #default="{ row }">
          <template v-if="buildingOf(row.id)">
            <div>{{ buildingOf(row.id)!.name }}</div>
            <div class="muted small">{{ BUILDING_KIND[buildingOf(row.id)!.kind] }} · {{ buildingOf(row.id)!.plaque }}</div>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="开播" width="140">
        <template #default="{ row }">{{ startDay(row.start_time) }}</template>
      </ElTableColumn>
      <ElTableColumn label="时长" width="80">
        <template #default="{ row }">{{ fmt(row.duration_s) }}</template>
      </ElTableColumn>
      <ElTableColumn label="字幕" width="80">
        <template #default="{ row }">
          <ElTag :type="row.subtitle_ready ? 'success' : 'info'" size="small">{{ row.subtitle_ready ? '就绪' : '无' }}</ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="密室" width="150">
        <template #default="{ row }">
          <ElTag :type="STATUS[row.game_status as GameStatus][1]" size="small">{{ STATUS[row.game_status as GameStatus][0] }}</ElTag>
          <ElTag v-if="row.game_edited_at" type="warning" size="small" class="edited">已调整</ElTag>
          <div v-if="row.game_error" class="error small" :title="row.game_error">{{ row.game_error.slice(0, 40) }}</div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="250">
        <template #default="{ row }">
          <ElButton size="small" type="primary" :loading="row.running" @click="generate(row as Replay)">{{ row.game_status === 'ready' ? '重新生成' : '生成' }}</ElButton>
          <ElButton v-if="!row.subtitle_ready" size="small" @click="outline(row as Replay)">触发 AI 大纲</ElButton>
          <template v-if="row.game_status === 'ready'">
            <RouterLink :to="`/admin/replays/${row.id}`"><ElButton size="small">配置</ElButton></RouterLink>
            <RouterLink :to="`/handout/${row.id}`" target="_blank"><ElButton size="small">讲义</ElButton></RouterLink>
          </template>
        </template>
      </ElTableColumn>
    </ElTable>
    <CityEditor v-model="editingCity" :cid="cid" :replays="ch.replays" @saved="load" />
  </template>
</template>

<style scoped>
.head { display: flex; gap: 16px; align-items: flex-start; }
.cover { width: 72px; height: 72px; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); }
.info { min-width: 0; }
h2 { margin: 0; }
.head p { margin: 6px 0 0; font-size: 13px; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.bar :deep(.el-button + .el-button) { margin-left: 0; }
.city { position: relative; margin: 20px 0; padding: 14px 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 4px; }
.city h3 { margin: 0; font-size: 26px; }
.city p { margin: 6px 0; line-height: 1.7; }
.street { margin-right: 10px; color: var(--text); }
.city-actions { position: absolute; top: 12px; right: 14px; display: flex; gap: 8px; align-items: center; }
.edited { margin-left: 4px; }
.small { font-size: 12px; }
.replay { display: flex; gap: 10px; align-items: center; }
.replay img { width: 80px; height: 45px; object-fit: cover; border-radius: 2px; background: #000; }
.title { font-weight: 500; }
.error { color: var(--cinnabar); }
</style>
