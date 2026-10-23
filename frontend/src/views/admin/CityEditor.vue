<script setup lang="ts">
// 整城配置调整：城名、旁白、街道分组、每座楼的名字匾额、更夫台词；保存过服务端同一套校验
import { computed, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDialog, ElInput, ElMessage, ElOption, ElSelect, ElTabPane, ElTabs } from 'element-plus'
import { api } from '@/api'
import type { City, Replay } from '@/types/city'
import { BUILDING_KIND } from './game/config'

const props = defineProps<{ cid: string; replays: Replay[] }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>({ required: true })

const city = ref<City>()
const generated = ref(true)
const errors = ref<string[]>([])
const saving = ref(false)
const tab = ref('form')
const jsonText = ref('')

const titleOf = computed(() => Object.fromEntries(props.replays.map(r => [r.id, `${r.sort_no}. ${r.title}`])))
const label = (rid: string) => titleOf.value[rid] || rid

watch(open, async v => {
  if (!v) return
  city.value = undefined
  errors.value = []
  tab.value = 'form'
  try {
    const r = await api.cityConfig(props.cid)
    city.value = r.city
    generated.value = r.generated
  } catch (e) {
    errors.value = [(e as Error).message]
  }
}, { immediate: true })

function beforeLeave(to: string | number, from: string | number) {
  if (to === 'json') jsonText.value = JSON.stringify(city.value, null, 2)
  if (from !== 'json') return true
  try {
    city.value = JSON.parse(jsonText.value)
    errors.value = []
    return true
  } catch (e) {
    errors.value = [`JSON 格式错误：${(e as Error).message}`]
    return false
  }
}

async function save() {
  if (tab.value === 'json' && !beforeLeave('form', 'json')) return
  saving.value = true
  try {
    await api.saveCity(props.cid, city.value!)
    ElMessage.success('整城配置已保存，观众端重新进城即生效')
    open.value = false
    emit('saved')
  } catch (e) {
    errors.value = (e as Error).message.split('\n')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ElDialog v-model="open" title="调整整城配置" width="min(960px, 96vw)" top="5vh" :close-on-click-modal="false">
    <ElAlert v-if="errors.length" type="error" :closable="false" show-icon class="errors" title="没保存：配置校验未通过">
      <ul><li v-for="(e, i) in errors" :key="i">{{ e }}</li></ul>
    </ElAlert>
    <p v-if="city && !generated" class="muted small">还没生成过整城，下面是按标题兜底的一份，改好保存即可直接用。</p>
    <p class="muted small">每个已生成的讲次恰好一座楼、恰好在一条街上；新生成的讲次已自动补在最后一条街。重新生成整城会覆盖这里的调整。</p>

    <ElTabs v-if="city" v-model="tab" :before-leave="beforeLeave">
      <ElTabPane label="表单" name="form">
        <div class="grid">
          <label>城名</label><ElInput v-model="city.name" maxlength="20" show-word-limit />
          <label>开场旁白</label><ElInput v-model="city.intro" type="textarea" :autosize="{ minRows: 2 }" maxlength="120" show-word-limit />
        </div>

        <h4>街道</h4>
        <div v-for="(s, i) in city.streets" :key="i" class="row line">
          <ElInput v-model="s.name" maxlength="12" placeholder="街名" style="width: 160px; flex: none" />
          <ElSelect v-model="s.replays" multiple placeholder="这条街上的楼（按讲次顺序）">
            <ElOption v-for="b in city.buildings" :key="b.replay" :value="b.replay" :label="label(b.replay)" />
          </ElSelect>
          <ElButton size="small" text type="danger" :disabled="city.streets.length <= 1" @click="city.streets.splice(i, 1)">删除</ElButton>
        </div>
        <ElButton size="small" @click="city.streets.push({ name: '', replays: [] })">+ 加一条街</ElButton>

        <h4>楼阁</h4>
        <div v-for="b in city.buildings" :key="b.replay" class="building">
          <div class="muted small">{{ label(b.replay) }}</div>
          <div class="row">
            <ElInput v-model="b.name" maxlength="10" placeholder="楼名" style="width: 150px; flex: none" />
            <ElInput v-model="b.plaque" maxlength="6" placeholder="匾额" style="width: 110px; flex: none" />
            <ElSelect v-model="b.kind" style="width: 100px; flex: none"><ElOption v-for="(v, k) in BUILDING_KIND" :key="k" :value="k" :label="v" /></ElSelect>
            <ElInput v-model="b.blurb" maxlength="60" placeholder="一句话介绍这一讲" />
          </div>
        </div>

        <h4>更夫 / 伙计</h4>
        <div v-for="(n, i) in city.npcs" :key="i" class="row line">
          <ElSelect v-model="n.replay" style="width: 220px; flex: none"><ElOption v-for="b in city.buildings" :key="b.replay" :value="b.replay" :label="label(b.replay)" /></ElSelect>
          <ElInput v-model="n.name" maxlength="8" placeholder="名字" style="width: 120px; flex: none" />
          <ElInput v-model="n.line" maxlength="60" placeholder="台词" />
          <ElButton size="small" text type="danger" @click="city.npcs.splice(i, 1)">删除</ElButton>
        </div>
        <ElButton size="small" :disabled="city.npcs.length >= 3" @click="city.npcs.push({ replay: city.buildings[0].replay, name: '', line: '' })">+ 加一位</ElButton>
      </ElTabPane>
      <ElTabPane label="JSON" name="json">
        <ElInput v-model="jsonText" type="textarea" :autosize="{ minRows: 20, maxRows: 40 }" class="json" spellcheck="false" />
      </ElTabPane>
    </ElTabs>

    <template #footer>
      <ElButton @click="open = false">取消</ElButton>
      <ElButton type="primary" :loading="saving" :disabled="!city" @click="save">保存</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.small { font-size: 12px; }
.errors { margin-bottom: 10px; }
.errors ul { margin: 4px 0 0; padding-left: 18px; }
h4 { margin: 16px 0 8px; }
.grid { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px 12px; align-items: center; }
.grid > label { color: var(--muted); font-size: 13px; text-align: right; }
.row { display: flex; gap: 8px; align-items: center; }
.row .el-input, .row .el-select { flex: 1; min-width: 0; }
.line { margin-bottom: 8px; }
.building { margin-bottom: 10px; }
.json :deep(textarea) { font-family: var(--mono); font-size: 12px; }
</style>
