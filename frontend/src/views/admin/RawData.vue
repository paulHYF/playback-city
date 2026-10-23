<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElButton, ElEmpty, ElInput, ElMessage, ElPagination, ElRadioButton, ElRadioGroup, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { api } from '@/api'
import type { ChannelDetail, RawFile, RawOverview } from '@/types/city'
import { SCENE_NAME } from '@/utils'

const props = defineProps<{ cid: string }>()
const ch = ref<ChannelDetail>()
const overview = ref<RawOverview>()
const error = ref('')

interface Selected { group: string; key: string; label: string; replayId?: string; name: string }
const selected = ref<Selected>()
const data = ref<unknown>()
const loading = ref(false)
const fileError = ref('')
const view = ref<'table' | 'json'>('table')
const keyword = ref('')
const page = ref(1)
const PAGE_SIZE = 50
const MAX_COLS = 30

const IMPORT_LABELS: Record<string, string> = { channel_info: '频道信息', playbacks: '回放列表', record_files: '暂存列表' }

onMounted(async () => {
  try {
    ;[ch.value, overview.value] = await Promise.all([api.channel(props.cid), api.rawOverview(props.cid)])
    const first = overview.value.import.files[0]
    const replay = overview.value.replays.find(r => r.files.length)
    if (first) open({ group: '导入数据', key: `import:${first.name}`, label: first.label, name: first.name })
    else if (replay) open({ group: replay.title, key: fileKey(replay.id, replay.files[0]), label: replay.files[0].label, replayId: replay.id, name: replay.files[0].name })
  } catch (e) {
    error.value = (e as Error).message
  }
})

async function open(s: Selected) {
  selected.value = s
  data.value = undefined
  fileError.value = ''
  keyword.value = ''
  page.value = 1
  loading.value = true
  try {
    data.value = s.replayId ? await api.rawReplayFile(s.replayId, s.name) : await api.rawImportFile(props.cid, s.name)
    view.value = rowsOf(data.value) ? 'table' : 'json'
  } catch (e) {
    fileError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function reimport() {
  try {
    await api.importChannel(props.cid, ch.value!.scene)
    overview.value = await api.rawOverview(props.cid)
    ElMessage.success('已重新导入并保存原始数据')
    const first = overview.value.import.files[0]
    if (first) open({ group: '导入数据', key: `import:${first.name}`, label: first.label, name: first.name })
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const refreshing = ref('')
async function refresh(rid: string) {
  refreshing.value = rid
  try {
    const st = await api.rawRefresh(rid)
    overview.value = await api.rawOverview(props.cid)
    const failed = Object.keys(st.errors)
    failed.length ? ElMessage.warning(`已重新拉取，${failed.join('、')} 失败`) : ElMessage.success('已重新拉取这一讲的原始数据')
    if (selected.value?.replayId === rid) open(selected.value)
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    refreshing.value = ''
  }
}

/** 能平铺成表格的部分：数组本身、分页结构的 contents、大纲的 outlineContent；单个对象竖排成「字段 / 值」。 */
function rowsOf(d: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(d)) return (d.every(x => x && typeof x === 'object') ? (d as Record<string, unknown>[]) : d.map(v => ({ value: v }))).map(flatten)
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>
    if (Array.isArray(o.contents)) return (o.contents as Record<string, unknown>[]).map(flatten)
    const outline = (o.outline as Record<string, unknown> | null)?.outlineContent
    if (Array.isArray(outline)) return (outline as Record<string, unknown>[]).map(flatten)
    return Object.entries(flatten(o)).map(([k, v]) => ({ 字段: k, 值: v }))
  }
  return null
}

/** 嵌套对象展开一层成 user.nickname 这样的列。 */
function flatten(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) out[`${k}.${k2}`] = v2
    } else out[k] = v
  }
  return out
}

const rows = computed(() => rowsOf(data.value) || [])
const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const allColumns = computed(() => {
  const keys = new Set<string>()
  for (const r of rows.value) Object.keys(r).forEach(k => keys.add(k))
  return [...keys]
})
/** 所有行都为空的字段不占列，完整字段在 JSON 视图里看。 */
const emptyColumns = computed(() => allColumns.value.filter(k => rows.value.every(r => cell(r[k]) === '')))
const columns = computed(() => allColumns.value.filter(k => !emptyColumns.value.includes(k)).slice(0, MAX_COLS))
const matched = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return k ? rows.value.filter(r => Object.values(r).some(v => cell(v).toLowerCase().includes(k))) : rows.value
})
const pageRows = computed(() => matched.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const pretty = computed(() => JSON.stringify(data.value, null, 2))
const meta = computed(() => {
  const d = data.value as Record<string, unknown> | null
  return d && !Array.isArray(d) && typeof d === 'object' && 'totalItems' in d
    ? `接口分页：第 ${d.pageNumber} 页 / 共 ${d.totalPages} 页，总数 ${d.totalItems}`
    : ''
})

function download() {
  const blob = new Blob([pretty.value], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${props.cid}-${selected.value!.replayId || 'import'}-${selected.value!.name}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

const kb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`)
const missingImport = computed(() => Object.keys(IMPORT_LABELS).filter(n => !overview.value?.import.files.some(f => f.name === n)))
const fileKey = (rid: string | undefined, f: RawFile) => `${rid || 'import'}:${f.name}`
</script>

<template>
  <p v-if="error" class="error">{{ error }}</p>
  <template v-if="ch && overview">
    <header class="head">
      <div>
        <RouterLink :to="`/admin/channels/${cid}`" class="muted small">← 返回 {{ ch.name }}</RouterLink>
        <h2>直播原始数据</h2>
        <p class="muted small">频道 {{ cid }} · {{ SCENE_NAME[ch.scene] }}。导入数据在按频道号导入时拉取；每{{ ch.scene === 'commerce' ? '场' : '讲' }}的观看、聊天、答题卡、问卷等在生成密室时拉取，原样保存，未做任何加工。</p>
      </div>
    </header>

    <div class="layout">
      <aside class="nav">
        <div class="group">
          <div class="group-title">导入数据 <span class="muted">频道级</span></div>
          <button v-for="f in overview.import.files" :key="f.name" class="file" :class="{ on: selected?.key === `import:${f.name}` }"
                  @click="open({ group: '导入数据', key: `import:${f.name}`, label: f.label, name: f.name })">
            <span>{{ f.label }}</span><span class="muted mono">{{ f.count ?? '' }}</span>
          </button>
          <div v-if="missingImport.length" class="hint">
            <p class="muted small">{{ missingImport.map(n => IMPORT_LABELS[n]).join('、') }}未保存（之前导入时还不落盘）</p>
            <ElButton size="small" @click="reimport">重新导入并保存</ElButton>
          </div>
        </div>

        <div v-for="r in overview.replays" :key="r.id" class="group">
          <div class="group-title" :title="r.title">
            <span class="ellipsis">第 {{ r.sort_no }} {{ ch.scene === 'commerce' ? '场' : '讲' }} · {{ r.title }}</span>
            <ElButton v-if="r.files.length" link size="small" type="primary" :loading="refreshing === r.id" title="只重拉直播接口数据，不重新生成密室"
                      @click="refresh(r.id)">重新拉取</ElButton>
          </div>
          <button v-for="f in r.files" :key="f.name" class="file" :class="{ on: selected?.key === fileKey(r.id, f) }"
                  @click="open({ group: r.title, key: fileKey(r.id, f), label: f.label, replayId: r.id, name: f.name })">
            <span>{{ f.label }}<ElTag v-if="r.errors[f.name]" type="danger" size="small" class="tag">失败</ElTag></span>
            <span class="muted mono">{{ f.count ?? '' }}</span>
          </button>
          <div v-for="(msg, name) in r.errors" :key="name" class="err small" :title="msg">✕ {{ name }}：{{ msg }}</div>
          <p v-if="!r.files.length" class="muted small hint">还没拉取，到频道页点「生成」后会保存这一{{ ch.scene === 'commerce' ? '场' : '讲' }}的原始数据</p>
        </div>
      </aside>

      <section class="viewer">
        <ElEmpty v-if="!selected" description="左侧选一份原始数据" />
        <template v-else>
          <div class="viewer-head">
            <div>
              <div class="muted small">{{ selected.group }}</div>
              <h3>{{ selected.label }} <span class="muted mono small">{{ selected.name }}.json</span></h3>
              <p v-if="meta" class="muted small">{{ meta }}</p>
            </div>
            <div class="tools">
              <ElInput v-if="view === 'table'" v-model="keyword" placeholder="搜索" clearable size="small" style="width: 180px" @input="page = 1" />
              <ElRadioGroup v-model="view" size="small">
                <ElRadioButton value="table" :disabled="!rowsOf(data)">表格</ElRadioButton>
                <ElRadioButton value="json">JSON</ElRadioButton>
              </ElRadioGroup>
              <ElButton size="small" :disabled="data === undefined" @click="download">下载</ElButton>
            </div>
          </div>
          <p v-if="loading" class="muted">加载中…</p>
          <p v-else-if="fileError" class="error">{{ fileError }}</p>
          <template v-else-if="view === 'table'">
            <p class="muted small">
              共 {{ matched.length }} 行
              <template v-if="emptyColumns.length">，隐藏 {{ emptyColumns.length }} 个全为空的字段（{{ emptyColumns.slice(0, 6).join('、') }}{{ emptyColumns.length > 6 ? '…' : '' }}）</template>
              <template v-if="allColumns.length - emptyColumns.length > MAX_COLS">，只显示前 {{ MAX_COLS }} 列</template>，完整字段切到 JSON 查看
            </p>
            <ElTable :data="pageRows" size="small" border max-height="calc(100vh - 290px)" empty-text="没有数据">
              <ElTableColumn type="index" :index="i => (page - 1) * PAGE_SIZE + i + 1" width="56" fixed />
              <ElTableColumn v-for="c in columns" :key="c" :label="c" min-width="140" show-overflow-tooltip>
                <template #default="{ row }">{{ cell(row[c]) }}</template>
              </ElTableColumn>
            </ElTable>
            <ElPagination v-if="matched.length > PAGE_SIZE" v-model:current-page="page" :page-size="PAGE_SIZE" :total="matched.length"
                          layout="prev, pager, next, total" small class="pager" />
          </template>
          <pre v-else class="json">{{ pretty }}</pre>
          <p class="muted small">文件大小 {{ kb(pretty.length) }}</p>
        </template>
      </section>
    </div>
  </template>
</template>

<style scoped>
h2 { margin: 6px 0 4px; }
h3 { margin: 2px 0; font-size: 16px; }
.small { font-size: 12px; }
.head p { margin: 0; line-height: 1.6; }
.layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; margin-top: 16px; }
.nav { border: 1px solid var(--line); background: var(--panel); border-radius: 4px; padding: 8px; max-height: calc(100vh - 150px); overflow: auto; }
.group + .group { border-top: 1px solid var(--line); margin-top: 8px; padding-top: 8px; }
.group-title { font-size: 12px; color: var(--gold-2); padding: 4px 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.file { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 8px; border: 0; border-radius: 3px; background: none; color: var(--text); font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
.file:hover { background: var(--panel-2); }
.file.on { background: var(--panel-2); color: var(--gold-2); }
.tag { margin-left: 6px; }
.hint { padding: 4px 8px; }
.hint p { margin: 0 0 6px; }
.err { color: var(--cinnabar); padding: 2px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.viewer { min-width: 0; border: 1px solid var(--line); background: var(--panel); border-radius: 4px; padding: 14px 16px; }
.viewer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.viewer-head p { margin: 2px 0 0; }
.tools { display: flex; gap: 8px; align-items: center; }
.json { margin: 0; padding: 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 4px; font: 12px/1.6 var(--mono); max-height: calc(100vh - 270px); overflow: auto; white-space: pre-wrap; word-break: break-all; }
.pager { margin-top: 10px; }
.error { color: var(--cinnabar); }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
</style>
