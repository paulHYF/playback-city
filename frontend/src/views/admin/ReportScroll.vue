<script setup lang="ts">
// 直播质量分析报告 · 竹简版：同一份报告数据由大模型写成的完整复盘文章，竖排刻在竹简上，自右向左读。
// 一行 = 一根竹简：正文行高与竹简宽度相同（SLIP），背景按同一宽度从右侧铺开，字就落在简上。
import { computed, onMounted, ref } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import { api } from '@/api'
import type { ReportArticle } from '@/types/city'

const props = defineProps<{ cid: string }>()
const art = ref<ReportArticle | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const writing = ref(false)
const flat = ref(false)
const scroller = ref<HTMLElement>()

const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

onMounted(async () => {
  try {
    art.value = await api.reportArticle(props.cid)
    state.value = 'ready'
  } catch (e) {
    state.value = 'error'
    error.value = (e as Error).message
  }
})

async function write() {
  writing.value = true
  try {
    art.value = await api.writeReportArticle(props.cid)
    ElMessage.success('竹简报告已写成')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    writing.value = false
  }
}

const date = computed(() => {
  if (!art.value) return ''
  const d = new Date(art.value.generatedAt)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
})

/** 竖排时 1–3 位的数字、字母（如 63%、P0）横向并成一格，更长的串保持侧转。 */
function segs(text: string) {
  return text.split(/([0-9A-Za-z.%:]+)/).filter(Boolean).map(t => ({ t, tcy: /^[0-9A-Za-z.%:]{1,3}$/.test(t) }))
}

/** 竖排时鼠标滚轮往下 = 往左读下去。 */
function wheel(e: WheelEvent) {
  const el = scroller.value
  if (flat.value || !el || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  e.preventDefault()
  el.scrollLeft -= e.deltaY
}
</script>

<template>
  <header class="head">
    <div>
      <RouterLink :to="`/admin/channels/${cid}/report`" class="muted small">← 返回数据报告</RouterLink>
      <h2>直播质量分析报告 · 竹简版</h2>
      <p v-if="art" class="muted small">{{ art.channel.name }}<template v-if="art.channel.city"> · {{ art.channel.city }}</template> · 写成于 {{ date }}</p>
    </div>
    <div class="bar">
      <ElButton v-if="art" @click="flat = !flat">{{ flat ? '竖排竹简' : '横排阅读' }}</ElButton>
      <ElButton type="primary" :loading="writing" @click="write">{{ writing ? '执笔中，约需一两分钟' : art ? '重新撰写' : '撰写竹简报告' }}</ElButton>
    </div>
  </header>

  <p v-if="state === 'error'" class="error">{{ error }}</p>
  <div v-else-if="state === 'ready' && !art" class="empty">
    <p class="brush">简 牍 未 书</p>
    <p class="muted">竹简版把数据报告写成一篇完整的复盘文章，由大模型按报告里的真实数据撰写，不改动任何数字。</p>
  </div>

  <div v-if="art" class="roll" :class="{ flat }">
    <article ref="scroller" class="slips" :class="{ writing }" tabindex="0" aria-label="竹简报告正文，自右向左阅读" @wheel="wheel">
      <h1>{{ art.title }}</h1>
      <p class="by">{{ art.channel.name }}<template v-if="art.channel.publisher"> · {{ art.channel.publisher }}</template></p>
      <p><template v-for="(s, k) in segs(art.preface)" :key="k"><span v-if="s.tcy" class="tcy">{{ s.t }}</span><template v-else>{{ s.t }}</template></template></p>
      <template v-for="(sec, i) in art.sections" :key="i">
        <h2>{{ NUM[i] ?? i + 1 }}　{{ sec.heading }}</h2>
        <p v-for="(para, j) in sec.paragraphs" :key="j"><template v-for="(s, k) in segs(para)" :key="k"><span v-if="s.tcy" class="tcy">{{ s.t }}</span><template v-else>{{ s.t }}</template></template></p>
      </template>
      <h2>结　语</h2>
      <p><template v-for="(s, k) in segs(art.closing)" :key="k"><span v-if="s.tcy" class="tcy">{{ s.t }}</span><template v-else>{{ s.t }}</template></template></p>
      <p class="sign">{{ date }}　回放不夜城复盘<span class="seal">复盘</span></p>
    </article>
  </div>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.head h2 { margin: 6px 0 4px; font-family: var(--serif); }
.bar { display: flex; gap: 8px; flex-wrap: wrap; }
.small { font-size: 13px; }
.error { color: var(--cinnabar); }
.empty { padding: 64px 16px; text-align: center; }
.empty .brush { font-size: 40px; letter-spacing: 0.3em; margin: 0 0 12px; }

.roll { --slip: 46px; --bamboo: #d6b574; --bamboo-dark: #b88d4c; --cord: #5b3a1d; --ink: #2a1d10; --seal: #a3312a;
  position: relative; min-width: 0; padding: 18px; background: linear-gradient(180deg, #2a1e14, #1a130c); border-radius: 6px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); }
.slips { writing-mode: vertical-rl; width: 100%; height: min(76vh, 760px); overflow-x: auto; overflow-y: hidden; padding: 64px 0; outline: none;
  font-family: var(--serif); font-size: 20px; line-height: var(--slip); letter-spacing: 0.08em; color: var(--ink);
  background-color: var(--bamboo); background-attachment: local; background-position: right top;
  background-image:
    linear-gradient(180deg, transparent 30px, var(--cord) 30px, var(--cord) 34px, transparent 34px, transparent calc(100% - 34px), var(--cord) calc(100% - 34px), var(--cord) calc(100% - 30px), transparent calc(100% - 30px)),
    repeating-linear-gradient(to left, rgba(70, 40, 12, 0.7) 0 2px, #dcbd7e 2px, #cfa865 20px, #d9b878 38px, var(--bamboo-dark) var(--slip));
  scrollbar-color: #8a6a3a #1a130c; }
.slips:focus-visible { box-shadow: inset 0 0 0 2px var(--seal); }
.slips.writing { opacity: 0.55; transition: opacity 0.3s; }
.slips h1, .slips h2, .slips p { margin: 0; font-weight: 400; }
.slips h1 { font-family: var(--brush); font-size: 30px; color: #6b2a20; letter-spacing: 0.2em; }
.slips h2 { font-family: var(--brush); font-size: 26px; color: #7a2a1e; letter-spacing: 0.15em; padding-top: 1em; }
.slips p { text-indent: 2em; text-align: justify; }
.slips .by { text-indent: 0; padding-top: 6em; font-size: 16px; color: #5a4128; }
.slips .sign { text-indent: 0; text-align: end; font-size: 16px; color: #5a4128; }
.tcy { text-combine-upright: all; }
.seal { display: inline-block; margin-block-start: 0.6em; font-family: var(--brush); font-size: 18px; line-height: 1.05; color: var(--seal);
  border: 2px solid var(--seal); border-radius: 3px; padding: 4px 2px; text-indent: 0; }

/* 横排阅读：同一篇文章铺在纸上 */
.roll.flat { background: none; box-shadow: none; padding: 0; }
.flat .slips { writing-mode: horizontal-tb; width: auto; height: auto; overflow: visible; max-width: 780px; margin: 0 auto; padding: 40px 48px;
  line-height: 1.95; font-size: 17px; background: linear-gradient(180deg, #e8dcc0, #d9c8a2); border-radius: 2px; box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45); }
.flat .slips h1 { text-align: center; line-height: 1.4; }
.flat .slips h2 { margin-top: 1.4em; padding-top: 0; line-height: 1.6; }
.flat .slips p { margin-top: 0.6em; }
.flat .slips .by { padding-top: 0; text-align: center; }
.flat .slips .sign { margin-top: 2em; }
.flat .tcy { text-combine-upright: none; }
.flat .seal { writing-mode: vertical-rl; margin-inline-start: 8px; vertical-align: middle; }

@media (max-width: 640px) {
  .roll { padding: 10px; }
  .slips { --slip: 40px; font-size: 18px; height: 70vh; }
  .flat .slips { padding: 24px 18px; }
}
</style>
