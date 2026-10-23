<script setup lang="ts">
// world 闯关配置（需求文档 8.3）：主题配色、每殿关卡机制、门题与道具链、Boss、NPC、时辰
import { computed } from 'vue'
import {
  ElButton, ElColorPicker, ElEmpty, ElInput, ElInputNumber, ElOption, ElRadioButton, ElRadioGroup, ElSelect, ElSlider, ElTag
} from 'element-plus'
import type { Game, Mechanic, ThemeKey, WorldRoom } from '@/types/game'
import { fmt } from '@/utils'
import TimeInput from './TimeInput.vue'
import ThemePicker from './ThemePicker.vue'
import { BOSS_ARCHETYPE, LAYOUT, MECHANIC, MECHANIC_DESC, MOOD, NPC_ARCHETYPE, THEME, defaultWorld, defaultWorldRoom, setMechanic } from './config'

const props = defineProps<{ game: Game; editing: boolean }>()
// 查看模式下点主题 / 生成默认配置：交给父页面进入编辑，再在草稿上落这一步
const emit = defineEmits<{ begin: [theme?: ThemeKey] }>()

const switchTheme = (t?: ThemeKey) => { if (t && t !== w.value?.theme) emit('begin', t) }
/** 生成默认配置（可带主题）；查看模式下先让父页面进入编辑 */
function begin(theme?: ThemeKey) {
  if (!props.editing) return emit('begin', theme)
  props.game.world = { ...defaultWorld(props.game), ...(theme ? { theme } : {}) }
}
const w = computed(() => props.game.world)

const wrOf = (i: number) => w.value?.rooms.find(r => r.room === i)
const itemOf = (i: number, id?: string | null) => props.game.rooms[i].items.find(it => it.id === id)
const toolName = (id?: string | null) => (id ? w.value?.items.find(t => t.id === id)?.name || id : '')
const bossKeywords = computed(() => props.game.rooms[props.game.boss_room]?.keywords || [])

function mechanicText(wr: WorldRoom) {
  const p = (t: string) => (t ? `${t}：` : '')
  if (wr.twin_doors) return `${p(wr.twin_doors.prompt)}左「${wr.twin_doors.left}」/ 右「${wr.twin_doors.right}」，答 ${wr.twin_doors.answer === 'left' ? '左' : '右'}`
  if (wr.order_steps) return `${p(wr.order_steps.prompt)}${wr.order_steps.steps.join(' → ')}`
  if (wr.code_fill) return `${p(wr.code_fill.prompt)}填「${wr.code_fill.options[0]}」`
  if (wr.calc) return `${p(wr.calc.prompt)}答案 ${wr.calc.answer}`
  return MECHANIC_DESC[wr.mechanic]
}

/** 道具链说明：哪一殿给、哪一殿要 */
const chain = computed(() => (w.value?.items || []).map(t => {
  const from = w.value!.rooms.find(r => r.reward === t.id)
  const need = w.value!.rooms.filter(r => r.requires === t.id).map(r => r.room + 1)
  return { ...t, from: from ? `第 ${from.room + 1} 殿门题` : w.value!.boss.reward === t.id ? 'Boss' : '（无来源）', need }
}))

function addWorldRoom(i: number) {
  w.value!.rooms.push(defaultWorldRoom(props.game, i))
  w.value!.rooms.sort((a, b) => a.room - b.room)
}
const removeWorldRoom = (i: number) => w.value!.rooms.splice(w.value!.rooms.findIndex(r => r.room === i), 1)
const changeMechanic = (wr: WorldRoom, m: Mechanic) => setMechanic(wr, m, props.game.rooms[wr.room].start)
function addTool() {
  const ids = new Set(w.value!.items.map(t => t.id))
  let n = w.value!.items.length + 1
  while (ids.has(`t${n}`)) n++
  w.value!.items.push({ id: `t${n}`, name: '', desc: '', use: '' })
}
const addNpc = () => w.value!.npcs.push({ archetype: props.game.skin === 'market' ? 'shop_clerk' : 'scholar_ghost', room: 0, faq: 0, line: '' })
</script>

<template>
  <!-- 还没有 world -->
  <template v-if="!w">
    <ElEmpty :image-size="80" description="还没有闯关配置：AI 没有产出（或校验未通过被去掉），游戏按默认关卡运行，地宫用场景默认主题">
      <ElButton type="primary" @click="begin()">按殿室生成默认配置</ElButton>
    </ElEmpty>
    <h4>或者先选一个地宫主题 <span class="muted small">点选后自动生成默认配置并进入编辑，保存才生效</span></h4>
    <ThemePicker @update:model-value="begin" />
  </template>

  <!-- 展示 -->
  <div v-else-if="!editing" class="view">
    <section class="card head">
      <div class="swatches">
        <span :style="{ background: w.palette.wall }" title="墙色" />
        <span :style="{ background: w.palette.accent }" title="点缀色" />
      </div>
      <div>
        <h3 class="brush">{{ w.name }}</h3>
        <p>{{ w.intro || '（无开场旁白）' }}</p>
        <p class="muted small">{{ THEME[w.theme] || w.theme }} · 墙色调 {{ w.palette.wall }} · 点缀 {{ w.palette.accent }} · 雾 {{ w.palette.fog }} · 一夜 {{ w.clock.real_minutes }} 分钟</p>
      </div>
    </section>
    <h4>地宫主题 <span class="muted small">点别的主题可直接切换（进入编辑，保存才生效）</span></h4>
    <ThemePicker :model-value="w.theme" @update:model-value="switchTheme" />

    <h4>殿室关卡</h4>
    <table class="tbl">
      <thead><tr><th>殿室</th><th>地名</th><th>布局 · 氛围</th><th>机制</th><th>门题</th><th>道具</th><th>机制配置</th></tr></thead>
      <tbody>
        <tr v-for="(r, i) in game.rooms" :key="i">
          <td>{{ i + 1 }}. {{ r.title }} <ElTag v-if="i === game.boss_room" type="danger" size="small">Boss</ElTag></td>
          <template v-if="wrOf(i)">
            <td>{{ wrOf(i)!.name }}</td>
            <td>{{ LAYOUT[wrOf(i)!.layout] }} · {{ MOOD[wrOf(i)!.mood] }}</td>
            <td>{{ i === game.boss_room ? 'Boss 对决' : MECHANIC[wrOf(i)!.mechanic] }}</td>
            <td>{{ itemOf(i, wrOf(i)!.door?.item)?.question || '—' }}</td>
            <td class="small">
              <div v-if="wrOf(i)!.reward">得：{{ toolName(wrOf(i)!.reward) }}</div>
              <div v-if="wrOf(i)!.requires">需：{{ toolName(wrOf(i)!.requires) }}</div>
              <span v-if="!wrOf(i)!.reward && !wrOf(i)!.requires" class="muted">—</span>
            </td>
            <td class="small">{{ mechanicText(wrOf(i)!) }}</td>
          </template>
          <td v-else colspan="6" class="muted">未配置，按默认卷宗匣答题</td>
        </tr>
      </tbody>
    </table>
    <p class="muted small">以上机制引擎都已实现，所有主题通用；Boss 殿固定为 Boss 对决；没配置的殿室按引擎默认轮换（拾灯 · 寻证 · 双门 · 找同类 · 拼原话 · 破惑）。</p>

    <div class="cols">
      <section class="card">
        <h4>Boss · {{ w.boss.name }}</h4>
        <p class="muted small">{{ BOSS_ARCHETYPE[w.boss.archetype] }} · 落在第 {{ game.boss_room + 1 }} 殿 · 弱点「{{ w.boss.weakness }}」· {{ w.boss.points }} 分<template v-if="w.boss.reward"> · 掉落 {{ toolName(w.boss.reward) }}</template></p>
        <p v-if="w.boss.taunt">「{{ w.boss.taunt }}」</p>
      </section>
      <section class="card">
        <h4>道具链</h4>
        <p v-if="!chain.length" class="muted small">没有道具</p>
        <div v-for="t in chain" :key="t.id" class="small line">
          <b>{{ t.name }}</b> <span class="muted mono">{{ t.id }}</span>：{{ t.from }} 给出<template v-if="t.need.length"> → 第 {{ t.need.join('、') }} 殿需要</template>
          <div class="muted">{{ t.desc }} {{ t.use }}</div>
        </div>
      </section>
      <section class="card">
        <h4>NPC</h4>
        <p v-if="!w.npcs.length" class="muted small">没有 NPC</p>
        <div v-for="(n, k) in w.npcs" :key="k" class="small line">
          <b>{{ NPC_ARCHETYPE[n.archetype] }}</b> · 第 {{ n.room + 1 }} 殿：「{{ n.line }}」
          <div class="muted">答疑：{{ game.faq[n.faq]?.question || `faq[${n.faq}] 不存在` }}</div>
        </div>
      </section>
    </div>
  </div>

  <!-- 调整 -->
  <div v-else class="edit">
    <section class="card grid">
      <label>地宫主题</label>
      <div>
        <ThemePicker v-model="w.theme" />
        <p class="muted small">决定地宫的贴图、灯光、氛围粒子、怪物涂装和叫法；Boss 名字以下方「Boss · 名字」为准。</p>
      </div>
      <label>地宫名</label><ElInput v-model="w.name" />
      <label>开场旁白</label><ElInput v-model="w.intro" type="textarea" :autosize="{ minRows: 2 }" />
      <label>配色</label>
      <div class="row">
        <span class="muted small">墙色调</span><ElColorPicker v-model="w.palette.wall" />
        <span class="muted small">点缀（拾取物光晕）</span><ElColorPicker v-model="w.palette.accent" />
        <span class="muted small">雾浓淡（0.16 为主题原样）</span><ElSlider v-model="w.palette.fog" :min="0.05" :max="0.3" :step="0.01" style="width: 200px" />
      </div>
      <label>一夜时长</label>
      <div class="row"><ElInputNumber v-model="w.clock.real_minutes" :min="5" :max="8" size="small" /><span class="muted small">分钟（十二时辰折合，5–8）</span></div>
    </section>

    <h4>殿室关卡</h4>
    <section v-for="(r, i) in game.rooms" :key="i" class="card">
      <div class="room-head">
        <b>{{ i + 1 }}. {{ r.title }}</b>
        <ElTag v-if="i === game.boss_room" type="danger" size="small">Boss</ElTag>
        <span class="muted small mono">{{ fmt(r.start) }}–{{ fmt(r.end) }}</span>
        <ElButton v-if="wrOf(i)" size="small" text type="danger" @click="removeWorldRoom(i)">移除配置</ElButton>
        <ElButton v-else size="small" @click="addWorldRoom(i)">+ 配置本殿</ElButton>
      </div>
      <div v-if="wrOf(i)" class="grid">
        <label>地名</label><ElInput v-model="wrOf(i)!.name" placeholder="如「索引长廊」" />
        <label>布局 · 氛围</label>
        <div class="row">
          <ElSelect v-model="wrOf(i)!.layout" style="width: 140px"><ElOption v-for="(v, k) in LAYOUT" :key="k" :value="k" :label="v" /></ElSelect>
          <ElSelect v-model="wrOf(i)!.mood" style="width: 140px"><ElOption v-for="(v, k) in MOOD" :key="k" :value="k" :label="v" /></ElSelect>
        </div>
        <label>门题</label>
        <ElSelect :model-value="wrOf(i)!.door?.item" clearable placeholder="答对才开门，可不设"
                  @update:model-value="(v?: string) => (wrOf(i)!.door = v ? { item: v } : undefined)">
          <ElOption v-for="it in r.items" :key="it.id" :value="it.id" :label="`${it.id} · ${it.question}`" />
        </ElSelect>
        <label>道具</label>
        <div class="row">
          <span class="muted small">开门得</span>
          <ElSelect v-model="wrOf(i)!.reward" clearable :disabled="!wrOf(i)!.door" placeholder="需先设门题" style="width: 160px">
            <ElOption v-for="t in w.items" :key="t.id" :value="t.id" :label="t.name || t.id" />
          </ElSelect>
          <span class="muted small">进门需</span>
          <ElSelect v-model="wrOf(i)!.requires" clearable placeholder="由更早殿室给出" style="width: 160px">
            <ElOption v-for="t in w.items" :key="t.id" :value="t.id" :label="t.name || t.id" />
          </ElSelect>
        </div>
        <label>机制</label>
        <ElSelect :model-value="wrOf(i)!.mechanic" style="width: 220px" @update:model-value="(m: Mechanic) => changeMechanic(wrOf(i)!, m)">
          <ElOption v-for="(v, k) in MECHANIC" :key="k" :value="k" :label="v" />
        </ElSelect>
        <label />
        <span class="muted small">{{ i === game.boss_room ? 'Boss 殿固定为 Boss 对决，这里选的机制不生效' : MECHANIC_DESC[wrOf(i)!.mechanic] }}</span>

        <template v-if="wrOf(i)!.twin_doors">
          <label>双门题面</label><ElInput v-model="wrOf(i)!.twin_doors!.prompt" />
          <label>两扇门</label>
          <div class="row">
            <ElInput v-model="wrOf(i)!.twin_doors!.left"><template #prepend>左</template></ElInput>
            <ElInput v-model="wrOf(i)!.twin_doors!.right"><template #prepend>右</template></ElInput>
            <ElRadioGroup v-model="wrOf(i)!.twin_doors!.answer" size="small"><ElRadioButton value="left">左对</ElRadioButton><ElRadioButton value="right">右对</ElRadioButton></ElRadioGroup>
          </div>
          <label>解析</label><ElInput v-model="wrOf(i)!.twin_doors!.explain" />
          <label>回放时间</label><TimeInput v-model="wrOf(i)!.twin_doors!.source_time" />
        </template>
        <template v-else-if="wrOf(i)!.order_steps">
          <label>排序题面</label><ElInput v-model="wrOf(i)!.order_steps!.prompt" />
          <label>正确顺序</label>
          <div class="steps">
            <div v-for="(_, k) in wrOf(i)!.order_steps!.steps" :key="k" class="row">
              <ElInput v-model="wrOf(i)!.order_steps!.steps[k]"><template #prepend>{{ k + 1 }}</template></ElInput>
              <ElButton size="small" text :disabled="wrOf(i)!.order_steps!.steps.length <= 3" @click="wrOf(i)!.order_steps!.steps.splice(k, 1)">删</ElButton>
            </div>
            <ElButton size="small" :disabled="wrOf(i)!.order_steps!.steps.length >= 6" @click="wrOf(i)!.order_steps!.steps.push('')">+ 加一步</ElButton>
          </div>
          <label>回放时间</label><TimeInput v-model="wrOf(i)!.order_steps!.source_time" />
        </template>
        <template v-else-if="wrOf(i)!.code_fill">
          <label>咒文题面</label><ElInput v-model="wrOf(i)!.code_fill!.prompt" />
          <label>代码</label><ElInput v-model="wrOf(i)!.code_fill!.code" type="textarea" :autosize="{ minRows: 2 }" class="mono" placeholder="用 ___ 标出空位" />
          <label>选项</label>
          <div class="options">
            <ElInput v-for="(_, k) in wrOf(i)!.code_fill!.options" :key="k" v-model="wrOf(i)!.code_fill!.options[k]"><template #prepend>{{ k === 0 ? '正确' : '干扰' + k }}</template></ElInput>
          </div>
          <label>解析</label><ElInput v-model="wrOf(i)!.code_fill!.explain" />
          <label>回放时间</label><TimeInput v-model="wrOf(i)!.code_fill!.source_time" />
        </template>
        <template v-else-if="wrOf(i)!.calc">
          <label>算账题面</label><ElInput v-model="wrOf(i)!.calc!.prompt" type="textarea" :autosize="{ minRows: 1 }" />
          <label>答案</label><ElInput v-model="wrOf(i)!.calc!.answer" />
          <label>解析</label><ElInput v-model="wrOf(i)!.calc!.explain" />
          <label>回放时间</label><TimeInput v-model="wrOf(i)!.calc!.source_time" />
        </template>
      </div>
      <p v-else class="muted small">未配置，按默认卷宗匣答题</p>
    </section>

    <h4>Boss <span class="muted small">（落在第 {{ game.boss_room + 1 }} 殿，在「殿室与题目」里换）</span></h4>
    <section class="card grid">
      <label>类型</label>
      <ElSelect v-model="w.boss.archetype" style="width: 200px"><ElOption v-for="(v, k) in BOSS_ARCHETYPE" :key="k" :value="k" :label="v" /></ElSelect>
      <label>名字</label><ElInput v-model="w.boss.name" />
      <label>弱点</label>
      <ElSelect v-model="w.boss.weakness" filterable allow-create placeholder="取自 Boss 殿关键词" style="width: 240px">
        <ElOption v-for="k in bossKeywords" :key="k" :value="k" :label="k" />
      </ElSelect>
      <label>台词</label><ElInput v-model="w.boss.taunt" />
      <label>奖励</label>
      <div class="row">
        <ElInputNumber v-model="w.boss.points" :min="0" :step="10" size="small" /><span class="muted small">分</span>
        <span class="muted small">掉落道具</span>
        <ElSelect v-model="w.boss.reward" clearable placeholder="可不设" style="width: 160px"><ElOption v-for="t in w.items" :key="t.id" :value="t.id" :label="t.name || t.id" /></ElSelect>
      </div>
    </section>

    <h4>道具 <span class="muted small">（每件只从一处得到；需要它的殿室必须在给出它的殿室之后）</span></h4>
    <section class="card">
      <div v-for="(t, k) in w.items" :key="k" class="tool row">
        <span class="mono muted">{{ t.id }}</span>
        <ElInput v-model="t.name" placeholder="名称，如灯油" style="width: 140px; flex: none" />
        <ElInput v-model="t.desc" placeholder="描述" />
        <ElInput v-model="t.use" placeholder="在哪里、怎么用" />
        <ElButton size="small" text type="danger" @click="w.items.splice(k, 1)">删除</ElButton>
      </div>
      <ElButton size="small" @click="addTool">+ 加道具</ElButton>
    </section>

    <h4>NPC</h4>
    <section class="card">
      <div v-for="(n, k) in w.npcs" :key="k" class="tool row">
        <ElSelect v-model="n.archetype" style="width: 120px"><ElOption v-for="(v, a) in NPC_ARCHETYPE" :key="a" :value="a" :label="v" /></ElSelect>
        <ElSelect v-model="n.room" style="width: 160px"><ElOption v-for="(r, i) in game.rooms" :key="i" :value="i" :label="`${i + 1}. ${r.title}`" /></ElSelect>
        <ElSelect v-model="n.faq" style="width: 220px" placeholder="答哪条高频问题">
          <ElOption v-for="(f, i) in game.faq" :key="i" :value="i" :label="f.question" />
        </ElSelect>
        <ElInput v-model="n.line" placeholder="开场台词" />
        <ElButton size="small" text type="danger" @click="w.npcs.splice(k, 1)">删除</ElButton>
      </div>
      <ElButton size="small" :disabled="!game.faq.length" @click="addNpc">+ 加 NPC</ElButton>
      <span v-if="!game.faq.length" class="muted small">&nbsp;没有高频问题，NPC 无话可答</span>
    </section>

    <ElButton type="danger" plain @click="game.world = undefined">清除闯关配置（按默认关卡）</ElButton>
  </div>
</template>

<style scoped>
.small { font-size: 12px; }
h4 { margin: 18px 0 8px; }
.card { border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; background: var(--panel); margin-bottom: 10px; }
.card h4 { margin: 0 0 6px; }
.card p { margin: 4px 0; line-height: 1.7; }
.head { display: flex; gap: 14px; }
.head h3 { margin: 0; font-size: 24px; }
.swatches { display: flex; flex-direction: column; gap: 4px; }
.swatches span { width: 28px; height: 28px; border-radius: 3px; border: 1px solid var(--line); }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { border-bottom: 1px solid var(--line); padding: 8px 6px; text-align: left; vertical-align: top; }
.tbl th { color: var(--muted); font-weight: 400; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin-top: 10px; }
.line { margin-bottom: 8px; }
.edit h4:first-child { margin-top: 0; }
.grid { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 8px 12px; align-items: center; }
.grid > label { color: var(--muted); font-size: 13px; text-align: right; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.row .el-input { flex: 1; min-width: 140px; }
.room-head { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.room-head .el-button { margin-left: auto; }
.steps { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.steps .row { width: 100%; flex-wrap: nowrap; }
.options { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
.tool { margin-bottom: 8px; }
</style>
