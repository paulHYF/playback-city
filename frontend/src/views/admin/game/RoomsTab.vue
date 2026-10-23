<script setup lang="ts">
// 殿室与题目：展示 / 调整。殿室由回放大纲分段而来，不增删；题目可增删改
import { ElButton, ElCollapse, ElCollapseItem, ElInput, ElInputTag, ElTag } from 'element-plus'
import type { Game } from '@/types/game'
import { fmt } from '@/utils'
import TimeInput from './TimeInput.vue'
import { newItemId } from './config'

const props = defineProps<{ game: Game; editing: boolean }>()

function addItem(i: number) {
  const r = props.game.rooms[i]
  r.items.push({ id: newItemId(props.game, i), keyword: '', question: '', code: '', options: ['', '', '', ''], explain: '', source_time: r.start, source_quote: '' })
}
</script>

<template>
  <ElCollapse>
    <ElCollapseItem v-for="(r, i) in game.rooms" :key="i" :name="i">
      <template #title>
        {{ i + 1 }}. {{ r.title }}
        <span class="muted mono">&nbsp;{{ fmt(r.start) }}–{{ fmt(r.end) }}</span>
        <ElTag v-if="i === game.boss_room" type="danger" size="small" class="tag">Boss</ElTag>
        <ElTag v-if="r.watched_ratio < 0.5" type="info" size="small" class="tag">墨雾</ElTag>
        <span class="muted">&nbsp;{{ r.items.length }} 题 · 错误率 {{ Math.round(r.fail_rate * 100) }}%</span>
      </template>

      <template v-if="!editing">
        <p>{{ r.summary }}</p>
        <p class="muted small">关键词：{{ r.keywords.join('、') || '—' }} · 观看覆盖 {{ Math.round(r.watched_ratio * 100) }}%</p>
        <ol>
          <li v-for="it in r.items" :key="it.id">
            <b>{{ it.keyword }}</b>：{{ it.question }} <span class="muted mono small">{{ it.id }}</span>
            <pre v-if="it.code">{{ it.code }}</pre>
            <div class="opts">
              <span v-for="(o, k) in it.options" :key="k" :class="['opt', { right: k === 0 }]">{{ 'ABCD'[k] }}. {{ o }}</span>
            </div>
            <div class="muted small">解析：{{ it.explain }}</div>
            <div class="muted small">原话「{{ it.source_quote }}」{{ fmt(it.source_time) }}</div>
          </li>
        </ol>
      </template>

      <div v-else class="edit">
        <div class="grid">
          <label>殿室名</label><ElInput v-model="r.title" />
          <label>时间段</label>
          <div class="row"><TimeInput v-model="r.start" /> – <TimeInput v-model="r.end" /><span class="muted small">题目原话时间须落在区间内</span></div>
          <label>摘要</label><ElInput v-model="r.summary" type="textarea" :autosize="{ minRows: 2 }" />
          <label>关键词</label><ElInputTag v-model="r.keywords" placeholder="输入后回车" />
          <label>Boss</label>
          <div class="row">
            <ElTag v-if="i === game.boss_room" type="danger">本殿为 Boss 殿</ElTag>
            <ElButton v-else size="small" :disabled="r.items.length < 3" @click="game.boss_room = i">设为 Boss 殿</ElButton>
            <span class="muted small">默认取答题卡错误率最高、题数 ≥ 3 的殿室；错误率与观看覆盖由真实数据计算，不在这里改</span>
          </div>
        </div>

        <div v-for="(it, k) in r.items" :key="it.id" class="item">
          <div class="item-head">
            <span class="mono muted">{{ it.id }}</span>
            <ElButton size="small" text type="danger" @click="r.items.splice(k, 1)">删除这题</ElButton>
          </div>
          <div class="grid">
            <label>关键词</label><ElInput v-model="it.keyword" />
            <label>题目</label><ElInput v-model="it.question" type="textarea" :autosize="{ minRows: 1 }" />
            <label>代码</label><ElInput v-model="it.code" type="textarea" :autosize="{ minRows: 1 }" class="mono" placeholder="可空" />
            <label>选项</label>
            <div class="options">
              <ElInput v-for="(_, o) in it.options" :key="o" v-model="it.options[o]">
                <template #prepend>{{ o === 0 ? '正确' : '干扰' + o }}</template>
              </ElInput>
            </div>
            <label>解析</label><ElInput v-model="it.explain" type="textarea" :autosize="{ minRows: 1 }" />
            <label>原话</label>
            <div class="row"><TimeInput v-model="it.source_time" /><ElInput v-model="it.source_quote" placeholder="讲师原话" /></div>
          </div>
        </div>
        <ElButton size="small" @click="addItem(i)">+ 加一题</ElButton>
      </div>
    </ElCollapseItem>
  </ElCollapse>
</template>

<style scoped>
.tag { margin-left: 8px; }
.small { font-size: 12px; }
pre { background: var(--panel-2); padding: 8px; border-radius: 3px; font-size: 12px; white-space: pre-wrap; }
li { margin-bottom: 12px; }
.opts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 4px 0; font-size: 13px; }
.opt.right { color: var(--jade); }
.edit { display: flex; flex-direction: column; gap: 12px; }
.grid { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px 12px; align-items: center; }
.grid > label { color: var(--muted); font-size: 13px; text-align: right; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.row .el-input { flex: 1; min-width: 160px; }
.options { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; }
.item { border: 1px solid var(--line); border-radius: 4px; padding: 10px 12px; background: var(--panel-2); }
.item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
</style>
