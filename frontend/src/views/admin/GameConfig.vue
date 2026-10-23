<script setup lang="ts">
// 单讲游戏配置：展示 AI 生成的 game.json，后台可调整（表单 + JSON 兜底），保存过服务端同一套校验，观众端进城即生效
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElAlert, ElButton, ElInput, ElMessage, ElMessageBox, ElTabPane, ElTabs, ElTag } from 'element-plus'
import { api } from '@/api'
import type { Game } from '@/types/game'
import type { Replay } from '@/types/city'
import RoomsTab from './game/RoomsTab.vue'
import TextTabs from './game/TextTabs.vue'
import WorldTab from './game/WorldTab.vue'
import { clone } from './game/config'

const props = defineProps<{ id: string }>()
const saved = ref<Game>()
const draft = ref<Game>()
const replay = ref<Replay>()
const editing = ref(false)
const saving = ref(false)
const errors = ref<string[]>([])
const tab = ref('rooms')
const jsonText = ref('')

const game = computed(() => (editing.value ? draft.value : saved.value))
const dirty = computed(() => editing.value && currentText() !== JSON.stringify(saved.value))
const itemCount = computed(() => game.value?.rooms.reduce((n, r) => n + r.items.length, 0) || 0)
const editedAt = computed(() => (replay.value?.game_edited_at ? new Date(replay.value.game_edited_at).toLocaleString('zh-CN') : ''))

/** 草稿的规范化文本；在 JSON 页签时以文本框为准 */
function currentText() {
  if (tab.value !== 'json') return JSON.stringify(draft.value)
  try { return JSON.stringify(JSON.parse(jsonText.value)) } catch { return jsonText.value }
}

onMounted(async () => {
  try {
    ;[saved.value, replay.value] = await Promise.all([api.replayGame(props.id), api.replay(props.id)])
  } catch (e) {
    errors.value = [(e as Error).message]
  }
})

function startEdit() {
  draft.value = clone(saved.value!)
  jsonText.value = JSON.stringify(draft.value, null, 2)
  errors.value = []
  editing.value = true
}

const confirmDiscard = () => ElMessageBox.confirm('改动还没保存，确定放弃？', '放弃改动', { type: 'warning' }).then(() => true, () => false)

async function cancel() {
  if (dirty.value && !(await confirmDiscard())) return
  editing.value = false
  errors.value = []
  if (tab.value === 'json') jsonText.value = JSON.stringify(saved.value, null, 2)
}

/** JSON 页签的文本写回草稿；不是合法 JSON 时留在 JSON 页签 */
function syncJson(): boolean {
  try {
    draft.value = JSON.parse(jsonText.value)
    errors.value = []
    return true
  } catch (e) {
    errors.value = [`JSON 格式错误：${(e as Error).message}`]
    return false
  }
}

function beforeLeave(to: string | number, from: string | number) {
  if (to === 'json') jsonText.value = JSON.stringify(game.value, null, 2)
  return editing.value && from === 'json' ? syncJson() : true
}

async function save() {
  if (tab.value === 'json' && !syncJson()) return
  saving.value = true
  try {
    saved.value = await api.saveGame(props.id, draft.value!)
    replay.value = await api.replay(props.id)
    editing.value = false
    errors.value = []
    if (tab.value === 'json') jsonText.value = JSON.stringify(saved.value, null, 2)
    ElMessage.success('已保存，观众端重新进城即生效')
  } catch (e) {
    errors.value = (e as Error).message.split('\n')
  } finally {
    saving.value = false
  }
}

onBeforeRouteLeave(async () => !dirty.value || (await confirmDiscard()))
const warnUnload = (e: BeforeUnloadEvent) => { if (dirty.value) e.preventDefault() }
onMounted(() => window.addEventListener('beforeunload', warnUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnUnload))
</script>

<template>
  <ElAlert v-if="errors.length && !game" :title="errors[0]" type="error" :closable="false" />
  <template v-if="game">
    <h2>{{ game.replay.title }}</h2>
    <p class="muted">
      {{ game.rooms.length }} 间殿室 · {{ itemCount }} 道题 · {{ game.faq.length }} 条高频问题 · {{ game.pairs.length }} 组易混 ·
      闯关配置{{ game.world ? '已配置' : '未配置' }}
      <ElTag v-if="editedAt" type="warning" size="small" class="tag">后台调整于 {{ editedAt }}</ElTag>
      <ElTag v-else type="info" size="small" class="tag">AI 生成原样</ElTag>
    </p>
    <div class="bar">
      <RouterLink :to="`/admin/channels/${game.replay.channelId}`"><ElButton>← 回放基础信息</ElButton></RouterLink>
      <RouterLink :to="`/city/${game.replay.channelId}`" target="_blank"><ElButton>进城试玩</ElButton></RouterLink>
      <RouterLink :to="`/handout/${id}`" target="_blank"><ElButton>讲义</ElButton></RouterLink>
      <span class="spacer" />
      <template v-if="editing">
        <span v-if="dirty" class="muted small">有未保存的改动</span>
        <ElButton @click="cancel">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
      </template>
      <ElButton v-else type="primary" :disabled="replay?.running" @click="startEdit">{{ replay?.running ? '重新生成中' : '调整配置' }}</ElButton>
    </div>

    <ElAlert v-if="errors.length" type="error" :closable="false" show-icon class="errors" title="没保存：配置校验未通过">
      <ul><li v-for="(e, i) in errors" :key="i">{{ e }}</li></ul>
    </ElAlert>
    <p v-if="editing" class="muted small hint">在草稿上改，点「保存」才生效；保存时按 AI 生成同一套规则校验（选项 4 个不重复、原话时间落在殿室区间内、道具链走得通等）。重新生成这一讲会覆盖后台调整。</p>

    <ElTabs v-model="tab" :before-leave="beforeLeave">
      <ElTabPane label="殿室与题目" name="rooms"><RoomsTab :game="game" :editing="editing" /></ElTabPane>
      <ElTabPane label="闯关配置" name="world"><WorldTab :game="game" :editing="editing" /></ElTabPane>
      <ElTabPane :label="`高频问题（${game.faq.length}）`" name="faq"><TextTabs :game="game" :editing="editing" section="faq" /></ElTabPane>
      <ElTabPane :label="`易混概念（${game.pairs.length}）`" name="pairs"><TextTabs :game="game" :editing="editing" section="pairs" /></ElTabPane>
      <ElTabPane label="讲义" name="handout"><TextTabs :game="game" :editing="editing" section="handout" /></ElTabPane>
      <ElTabPane label="JSON" name="json">
        <p class="muted small">完整 game.json。{{ editing ? '表单没覆盖的字段在这里改；回放身份（replay）、场景与皮肤以服务端为准，改了不生效。' : '点「调整配置」后可编辑。' }}</p>
        <ElInput v-model="jsonText" type="textarea" :autosize="{ minRows: 24, maxRows: 48 }" :readonly="!editing" class="json" spellcheck="false" />
      </ElTabPane>
    </ElTabs>
  </template>
</template>

<style scoped>
h2 { margin: 0; }
.tag { margin-left: 8px; }
.small { font-size: 12px; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0 16px; }
.bar :deep(.el-button + .el-button) { margin-left: 0; }
.spacer { flex: 1; }
.errors { margin-bottom: 12px; }
.errors ul { margin: 4px 0 0; padding-left: 18px; }
.hint { margin: 0 0 8px; }
.json :deep(textarea) { font-family: var(--mono); font-size: 12px; }
</style>
