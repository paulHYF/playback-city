<script setup lang="ts">
// 高频问题 / 易混概念 / 讲义：展示 / 调整（按 section 只渲染其中一块）
import { computed } from 'vue'
import { marked } from 'marked'
import { ElButton, ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'
import type { Game } from '@/types/game'
import { fmt } from '@/utils'
import TimeInput from './TimeInput.vue'

const props = defineProps<{ game: Game; editing: boolean; section: 'faq' | 'pairs' | 'handout' }>()
const handoutHtml = computed(() => marked.parse(props.game.handout.markdown) as string)

const addFaq = () => props.game.faq.push({ room: 0, count: 1, question: '', answer: '', source_time: props.game.rooms[0].start, samples: [] })
const addPair = () => props.game.pairs.push({ a: '', b: '', diff: '', source_time: 0 })
</script>

<template>
  <!-- 高频问题：书生灯影 / 伙计答疑的素材 -->
  <template v-if="section === 'faq'">
    <p v-if="!game.faq.length && !editing" class="muted">没有高频问题</p>
    <div v-for="(f, i) in game.faq" :key="i" class="card">
      <template v-if="!editing">
        <div><b>{{ f.question }}</b> <span class="muted small">· {{ f.count }} 人问过 · 第 {{ f.room + 1 }} 殿 · {{ fmt(f.source_time) }}</span></div>
        <p>{{ f.answer }}</p>
        <div v-if="f.samples.length" class="muted small">原话：<span v-for="(s, k) in f.samples" :key="k" class="sample">{{ s[0] }}「{{ s[1] }}」{{ s[2] }}</span></div>
      </template>
      <div v-else class="grid">
        <label>问题</label><ElInput v-model="f.question" />
        <label>回答</label><ElInput v-model="f.answer" type="textarea" :autosize="{ minRows: 2 }" />
        <label>归属</label>
        <div class="row">
          <ElSelect v-model="f.room" style="width: 220px">
            <ElOption v-for="(r, k) in game.rooms" :key="k" :value="k" :label="`${k + 1}. ${r.title}`" />
          </ElSelect>
          <span class="muted small">问过人数</span><ElInputNumber v-model="f.count" :min="1" size="small" />
          <span class="muted small">回放时间</span><TimeInput v-model="f.source_time" />
          <ElButton size="small" text type="danger" @click="game.faq.splice(i, 1)">删除</ElButton>
        </div>
      </div>
    </div>
    <ElButton v-if="editing" size="small" @click="addFaq">+ 加一条</ElButton>
  </template>

  <!-- 易混概念：双门辨析 / 卧底局的素材 -->
  <template v-else-if="section === 'pairs'">
    <p v-if="!game.pairs.length && !editing" class="muted">没有易混概念</p>
    <div v-for="(p, i) in game.pairs" :key="i" class="card">
      <template v-if="!editing">
        <div><b>{{ p.a }}</b> vs <b>{{ p.b }}</b> <span class="muted small">· {{ fmt(p.source_time) }}</span></div>
        <p>{{ p.diff }}</p>
      </template>
      <div v-else class="grid">
        <label>概念</label>
        <div class="row"><ElInput v-model="p.a" /> vs <ElInput v-model="p.b" /></div>
        <label>区别</label><ElInput v-model="p.diff" type="textarea" :autosize="{ minRows: 2 }" />
        <label>时间</label>
        <div class="row"><TimeInput v-model="p.source_time" /><ElButton size="small" text type="danger" @click="game.pairs.splice(i, 1)">删除</ElButton></div>
      </div>
    </div>
    <ElButton v-if="editing" size="small" @click="addPair">+ 加一组</ElButton>
  </template>

  <!-- 讲义 / 卖点卡 -->
  <template v-else>
    <div v-if="!editing" class="handout">
      <h3>{{ game.handout.title }}</h3>
      <div class="md" v-html="handoutHtml" />
    </div>
    <div v-else class="handout-edit">
      <ElInput v-model="game.handout.title" placeholder="标题" />
      <div class="split">
        <ElInput v-model="game.handout.markdown" type="textarea" :autosize="{ minRows: 20 }" class="mono" />
        <div class="md preview" v-html="handoutHtml" />
      </div>
    </div>
  </template>
</template>

<style scoped>
.small { font-size: 12px; }
.card { border: 1px solid var(--line); border-radius: 4px; padding: 10px 12px; margin-bottom: 10px; background: var(--panel); }
.card p { margin: 6px 0; line-height: 1.7; }
.sample { margin-right: 12px; }
.grid { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 8px 12px; align-items: center; }
.grid > label { color: var(--muted); font-size: 13px; text-align: right; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.row .el-input { flex: 1; min-width: 140px; }
.md { line-height: 1.8; }
.md :deep(pre) { background: var(--panel-2); padding: 8px; border-radius: 3px; overflow-x: auto; }
.handout-edit { display: flex; flex-direction: column; gap: 10px; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.preview { border: 1px solid var(--line); border-radius: 4px; padding: 0 14px; max-height: 640px; overflow: auto; }
@media (max-width: 960px) { .split { grid-template-columns: 1fr; } }
</style>
