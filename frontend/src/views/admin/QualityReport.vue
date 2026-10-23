<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElMessage, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { api } from '@/api'
import type { AiReview, Level, QualityReport, ReplayQuality, ReportDimension } from '@/types/city'
import { fmt, SCENE_NAME } from '@/utils'

const props = defineProps<{ cid: string }>()
const rep = ref<QualityReport>()
const error = ref('')
const aiLoading = ref(false)

async function load() {
  try {
    rep.value = await api.report(props.cid)
    error.value = ''
  } catch (e) {
    error.value = (e as Error).message
  }
}
onMounted(load)

async function genAi() {
  aiLoading.value = true
  try {
    rep.value!.ai = await api.reportAi(props.cid)
    rep.value!.aiStale = false
    ElMessage.success('AI 复盘点评已生成')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    aiLoading.value = false
  }
}

const print = () => window.print()
const unit = computed(() => (rep.value?.channel.scene === 'commerce' ? '场' : '讲'))
const role = computed(() => (rep.value?.channel.scene === 'commerce' ? '主播' : '讲师'))
// 优化方案按直播时间线排阶段，与 backend report.AI_SCENE 的 stages 一致
const STAGES: Record<string, string[]> = {
  course: ['课前准备', '开场', '讲授节奏', '互动与检测', '收尾', '课后与回放'],
  commerce: ['预热引流', '开场', '讲品', '互动与转化', '收尾返场', '回放与二次分发']
}
/** 优化方案按阶段分组，组内 P0 在前；模型给出的阶段名不在列表里时排在最后 */
const planGroups = computed(() => {
  const ai = rep.value?.ai
  if (!ai) return []
  const order = STAGES[ai.scene] || []
  const rank = (s: string) => (order.includes(s) ? order.indexOf(s) : order.length)
  const groups: { stage: string; items: AiReview['plan'] }[] = []
  for (const x of ai.plan) {
    const g = groups.find(g => g.stage === x.stage) || groups[groups.push({ stage: x.stage, items: [] }) - 1]
    g.items.push(x)
  }
  groups.forEach(g => g.items.sort((a, b) => a.priority.localeCompare(b.priority)))
  return groups.sort((a, b) => rank(a.stage) - rank(b.stage))
})
const dims = computed(() => {
  if (!rep.value) return []
  const d = rep.value.dimensions
  const training = { key: 'training', name: '培训维度', desc: '学员是否听完、听懂、掌握', dim: d.training }
  const marketing = { key: 'marketing', name: '营销维度', desc: '观众是否留下、心动、产生购买意向', dim: d.marketing }
  return rep.value.channel.scene === 'commerce' ? [marketing, training] : [training, marketing]
})

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`)
const time = (ms: number) => new Date(ms).toLocaleString('zh-CN', { hour12: false })
const LEVEL: Record<Level, [string, string]> = { good: ['优', 'var(--jade)'], fair: ['良', 'var(--gold)'], poor: ['待改进', 'var(--cinnabar)'], none: ['无数据', 'var(--muted)'] }
const grade = (s: number | null) => (s === null ? '无数据' : s >= 85 ? '优秀' : s >= 70 ? '良好' : s >= 60 ? '合格' : '待改进')
const scoreColor = (s: number | null) => (s === null ? 'var(--muted)' : s >= 80 ? 'var(--jade)' : s >= 60 ? 'var(--gold)' : 'var(--cinnabar)')
const ring = (d: ReportDimension) => `conic-gradient(${scoreColor(d.score)} ${(d.score ?? 0) * 3.6}deg, var(--line) 0deg)`

const BUCKETS = ['< 25%', '25–50%', '50–75%', '≥ 75%']
const AGE = ['当天', '1–3 天', '4–7 天', '7 天后']
const SOURCE: Record<string, string> = { full: '完整回放', clip: '片段', revive: '复活回看' }
const sourcesOf = (r: ReplayQuality) => Object.entries(r.review.sources).map(([k, n]) => `${SOURCE[k] || k} ${n}`).join(' · ')
const inSegment = (r: ReplayQuality, k: number) => r.review.segments.some(s => k * r.review.bin >= s.from && k * r.review.bin < s.to)
const maxOf = (xs: number[]) => Math.max(1, ...xs)
const topicsOf = (r: ReplayQuality) => {
  const scene = rep.value!.channel.scene
  const other = scene === 'commerce' ? 'course' : 'commerce'
  return [...Object.entries(r.chat.topics[scene]), ...Object.entries(r.chat.topics[other])].filter(([, n]) => n > 0)
}
const roomSpans = (r: ReplayQuality) =>
  r.rooms.map(rm => ({ ...rm, left: (rm.start / Math.max(1, r.duration)) * 100, width: ((rm.end - rm.start) / Math.max(1, r.duration)) * 100 }))
const QTYPE: Record<string, string> = { R: '单选', C: '多选', X: '打分', Q: '问答' }
</script>

<template>
  <p v-if="error" class="error">{{ error }}</p>
  <template v-if="rep">
    <header class="head">
      <div>
        <RouterLink :to="`/admin/channels/${cid}`" class="muted small no-print">← 返回 {{ rep.channel.name }}</RouterLink>
        <h2>直播质量分析报告</h2>
        <p class="muted small">
          {{ rep.channel.name }}（{{ cid }}）· {{ SCENE_NAME[rep.channel.scene] }}<template v-if="rep.channel.city"> · {{ rep.channel.city }}</template>
          · 主持人 {{ rep.channel.publisher || '—' }} · 生成于 {{ time(rep.generatedAt) }}
        </p>
      </div>
      <div class="bar no-print">
        <ElButton @click="load">刷新数据</ElButton>
        <ElButton type="primary" :loading="aiLoading" @click="genAi">{{ rep.ai ? '重新生成 AI 点评' : '生成 AI 点评' }}</ElButton>
        <ElButton @click="print">打印 / 导出 PDF</ElButton>
        <ElButton @click="$router.push(`/admin/channels/${cid}/report/scroll`)">竹简报告版</ElButton>
      </div>
    </header>

    <ElAlert v-if="rep.summary.analyzed && !rep.summary.viewSplit" type="info" :closable="false" show-icon class="alert"
             title="观看记录还是旧格式（直播、回放混在一起），以下观看指标全部按直播计。到「直播原始数据」页对各讲点「重新拉取」即可拆开。" />
    <ElAlert v-if="!rep.summary.analyzed" type="warning" :closable="false" show-icon class="alert"
             :title="`还没有任何一${unit}拉取过直播原始数据，报告只有基础信息。先到频道页生成至少一${unit}，再来看报告。`" />

    <section class="kpis">
      <div class="kpi"><b>{{ rep.summary.analyzed }} / {{ rep.summary.replays }}</b><span>已分析{{ unit }}次</span><em>总时长 {{ fmt(rep.summary.duration) }}</em></div>
      <div class="kpi"><b>{{ rep.summary.viewers }}</b><span>直播观众</span><em>平均完课 {{ pct(rep.summary.completion) }}</em></div>
      <div class="kpi"><b>{{ rep.summary.viewSplit ? rep.summary.vodViewers : '—' }}</b><span>回放观众</span>
        <em>完课 {{ pct(rep.summary.vodCompletion) }} · 只看回放 {{ rep.summary.vodOnly }} · 看两遍+ {{ rep.summary.vodRepeat }}</em></div>
      <div class="kpi"><b>{{ rep.summary.reviewers }}</b><span>回放城回看观众</span><em>{{ rep.summary.reviewRanges }} 段回看记录 · 用于找重点回顾段</em></div>
      <div class="kpi"><b>{{ rep.summary.messages }}</b><span>观众弹幕</span><em>{{ rep.summary.speakers }} 人发言 · 每分钟 {{ rep.summary.perMinute ?? '—' }} 条</em></div>
      <div class="kpi"><b>{{ pct(rep.summary.quizCorrect) }}</b><span>答题正确率</span><em>{{ rep.summary.quizCount }} 张卡 · {{ rep.summary.quizAnswers }} 人次作答</em></div>
      <div class="kpi"><b>{{ rep.summary.satisfaction ?? '—' }}<small v-if="rep.summary.satisfaction"> / 5</small></b><span>问卷满意度</span><em>反馈率 {{ pct(rep.summary.qnRate) }}</em></div>
      <div class="kpi"><b>{{ rep.summary.faqTotal }}</b><span>高频疑问人次</span><em>回放城 AI 归纳</em></div>
      <div class="kpi"><b>{{ rep.summary.play.viewers }}</b><span>回放城闯关观众</span><em>通关率 {{ pct(rep.summary.play.clearRate) }} · 复活 {{ rep.summary.play.revives }} 次</em></div>
    </section>

    <section class="dims">
      <article v-for="(d, i) in dims" :key="d.key" class="dim" :class="{ primary: i === 0 }">
        <div class="dim-head">
          <div class="ring" :style="{ background: ring(d.dim) }">
            <div><b :style="{ color: scoreColor(d.dim.score) }">{{ d.dim.score ?? '—' }}</b><span>{{ grade(d.dim.score) }}</span></div>
          </div>
          <div>
            <h3>{{ d.name }} <ElTag v-if="i === 0" size="small" type="warning">主维度</ElTag></h3>
            <p class="muted small">{{ d.desc }}；各指标按权重折算 0–100 分，无数据的指标不计分。</p>
          </div>
        </div>
        <div class="indicators">
          <div v-for="it in d.dim.indicators" :key="it.key" class="ind" :title="it.tip">
            <span class="ind-name">{{ it.name }}<i class="muted"> ×{{ it.weight }}</i></span>
            <div class="track"><div class="fill" :style="{ width: `${it.score ?? 0}%`, background: LEVEL[it.level][1] }" /></div>
            <span class="ind-val mono">{{ it.display }}</span>
            <span class="ind-lv" :style="{ color: LEVEL[it.level][1] }">{{ LEVEL[it.level][0] }}</span>
          </div>
        </div>
        <h4>诊断发现</h4>
        <ul v-if="d.dim.findings.length"><li v-for="f in d.dim.findings" :key="f">{{ f }}</li></ul>
        <p v-else class="muted small">数据不足，暂无发现。</p>
        <h4>改进建议</h4>
        <ol v-if="d.dim.actions.length"><li v-for="a in d.dim.actions" :key="a">{{ a }}</li></ol>
        <p v-else class="muted small">暂无。</p>
      </article>
    </section>

    <section v-if="rep.ai" class="panel ai">
      <h3>{{ role }}复盘 · AI 深度点评
        <span class="muted small">{{ rep.ai.scene === 'commerce' ? '营销转化视角' : '教学效果视角' }} · 生成于 {{ time(rep.ai.generatedAt) }} · 基于上方真实数据撰写，不改动数值</span>
      </h3>
      <p class="verdict brush">{{ rep.ai.verdict }}</p>
      <p>{{ rep.ai.summary }}</p>

      <div v-if="rep.ai.strengths.length" class="strengths">
        <h4>值得保持</h4>
        <ul><li v-for="x in rep.ai.strengths" :key="x.point"><b>{{ x.point }}</b><span class="muted"> — {{ x.evidence }}</span></li></ul>
      </div>

      <h4>问题诊断</h4>
      <div class="diag">
        <article v-for="(d, i) in rep.ai.diagnosis" :key="i" class="diag-card">
          <div class="diag-head"><b>{{ i + 1 }}. {{ d.title }}</b><ElTag v-if="d.confidence === 'low'" size="small" type="info">信号较弱</ElTag></div>
          <dl>
            <dt>证据</dt><dd>{{ d.evidence }}</dd>
            <dt>根因</dt><dd>{{ d.cause }}</dd>
            <dt v-if="d.impact">影响</dt><dd v-if="d.impact">{{ d.impact }}</dd>
          </dl>
        </article>
      </div>

      <template v-if="rep.ai.moments.length">
        <h4>关键时刻复盘 <span class="muted small">对着回放逐段看</span></h4>
        <table class="moments">
          <thead><tr><th>位置</th><th>当时发生了什么</th><th>下次这段怎么{{ rep.ai.scene === 'commerce' ? '播' : '讲' }}</th></tr></thead>
          <tbody>
            <tr v-for="(m, i) in rep.ai.moments" :key="i">
              <td class="mono nowrap">第 {{ m.no }} {{ unit }}<br />{{ m.time }}</td><td>{{ m.what }}</td><td>{{ m.advice }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <h4>下一{{ unit }}优化方案</h4>
      <div class="plan">
        <div v-for="g in planGroups" :key="g.stage" class="plan-group">
          <div class="stage">{{ g.stage }}</div>
          <div v-for="(x, i) in g.items" :key="i" class="plan-item">
            <ElTag size="small" :type="x.priority === 'P0' ? 'danger' : x.priority === 'P1' ? 'warning' : 'info'" effect="plain">{{ x.priority }}</ElTag>
            <div><div>{{ x.action }}</div><div v-if="x.metric" class="muted small">验证：{{ x.metric }}</div></div>
          </div>
        </div>
      </div>

      <div class="ai-cols">
        <div v-if="rep.ai.checklist.length"><h4>开播前自检</h4><ul class="check"><li v-for="x in rep.ai.checklist" :key="x">☐ {{ x }}</li></ul></div>
        <div v-if="rep.ai.questions.length"><h4>留给你的复盘问题</h4><ol><li v-for="x in rep.ai.questions" :key="x">{{ x }}</li></ol></div>
        <div v-if="rep.ai.dataGaps.length"><h4>数据缺口</h4><ul><li v-for="x in rep.ai.dataGaps" :key="x" class="muted">{{ x }}</li></ul></div>
      </div>
    </section>
    <ElAlert v-else-if="rep.aiStale" class="alert no-print" type="info" :closable="false" show-icon
             :title="`AI 点评已改为面向${role}的单视角深度复盘，旧版点评不再展示，点「生成 AI 点评」重新生成`" />

    <h3 class="section-title">逐{{ unit }}明细</h3>
    <section v-for="r in rep.replays" :key="r.id" class="panel replay">
      <div class="replay-head">
        <h3>第 {{ r.no }} {{ unit }} · {{ r.title }}</h3>
        <span class="muted small">时长 {{ fmt(r.duration) }} · 直播 {{ r.live.viewers }} 人 · 完课 {{ pct(r.live.completion) }}
          <template v-if="r.viewSplit"> · 回放 {{ r.vod.viewers }} 人 · 完课 {{ pct(r.vod.completion) }}</template></span>
        <ElTag v-if="!r.hasRaw" size="small" type="info">未拉取原始数据</ElTag>
        <ElTag v-else-if="!r.gameReady" size="small" type="warning">回放城未生成，殿室与疑问数据缺失</ElTag>
      </div>
      <template v-if="r.hasRaw">
        <h4 class="group">直播 <span class="muted">· 到场与留存</span></h4>
        <div class="grid">
          <div class="card wide">
            <h4>在线人数 <span class="muted">（每分钟，峰值 {{ r.live.peak }} 人<template v-if="r.live.drop">；第 {{ r.live.drop.minute + 1 }} 分钟流失最多，走了 {{ r.live.drop.lost }} 人<template v-if="r.live.drop.room">，正在讲「{{ r.live.drop.room }}」</template></template>）</span></h4>
            <div v-if="r.live.peak" class="heat">
              <div v-for="(n, m) in r.live.online" :key="m" class="hbar" :class="{ peak: r.live.drop?.minute === m }" :title="`第 ${m + 1} 分钟 ${n} 人在线`">
                <div :style="{ height: `${(n / maxOf(r.live.online)) * 100}%` }" />
              </div>
            </div>
            <p v-else class="muted small">没有直播观看日志的进出时间，画不出在线曲线。</p>
            <div v-if="r.rooms.length && r.live.peak" class="spans">
              <div v-for="s in roomSpans(r)" :key="s.title" class="span" :style="{ left: `${s.left}%`, width: `${s.width}%` }" :title="`${s.title} ${fmt(s.start)}–${fmt(s.end)}`">{{ s.title }}</div>
            </div>
          </div>
          <div class="card">
            <h4>直播观看时长分布 <span class="muted">（占直播时长，平均 {{ fmt(r.live.avgWatch) }}）</span></h4>
            <div class="bars">
              <div v-for="(n, k) in r.live.buckets" :key="k" class="vbar">
                <div class="vfill" :style="{ height: `${(n / maxOf(r.live.buckets)) * 100}%` }" /><b>{{ n }}</b><span>{{ BUCKETS[k] }}</span>
              </div>
            </div>
          </div>
        </div>

        <h4 class="group">回放 <span class="muted">· 谁回来看、看了哪里</span></h4>
        <div class="grid">
          <div class="card">
            <h4>回放观众 <span class="muted">（{{ r.vod.viewers }} 人 / {{ r.vod.plays }} 次播放，平均 {{ fmt(r.vod.avgWatch) }}）</span></h4>
            <template v-if="r.viewSplit && r.vod.viewers">
              <div class="hrow"><span class="hname">直播看过又来补看</span>
                <div class="track"><div class="fill" :style="{ width: `${(r.vod.fromLive / r.vod.viewers) * 100}%` }" /></div><span class="mono small">{{ r.vod.fromLive }}</span></div>
              <div class="hrow"><span class="hname">只看回放的新观众</span>
                <div class="track"><div class="fill" :style="{ width: `${(r.vod.vodOnly / r.vod.viewers) * 100}%` }" /></div><span class="mono small">{{ r.vod.vodOnly }}</span></div>
              <div class="hrow"><span class="hname">看了两遍以上</span>
                <div class="track"><div class="fill" :style="{ width: `${(r.vod.repeat / r.vod.viewers) * 100}%` }" /></div><span class="mono small">{{ r.vod.repeat }}</span></div>
              <p class="muted small">直播没看到一半的 {{ r.vod.liveShort }} 人里，{{ r.vod.makeup }} 人回来补看了。</p>
              <h4>首次看回放距直播</h4>
              <div class="bars short">
                <div v-for="(n, k) in r.vod.age" :key="k" class="vbar">
                  <div class="vfill jade" :style="{ height: `${(n / maxOf(r.vod.age)) * 100}%` }" /><b>{{ n }}</b><span>{{ AGE[k] }}</span>
                </div>
              </div>
            </template>
            <p v-else class="muted small">{{ r.viewSplit ? '这一' + unit + '还没有人看回放。' : '旧格式观看记录未区分回放，重新拉取原始数据后可见。' }}</p>
          </div>
          <div class="card wide">
            <h4>重点回顾段 <span class="muted">（回放城里 {{ r.review.reviewers }} 人的 {{ r.review.ranges }} 段回看叠加，每 {{ r.review.bin }} 秒一格<template v-if="r.review.ranges">；{{ sourcesOf(r) }}</template>）</span></h4>
            <template v-if="r.review.ranges">
              <div class="heat">
                <div v-for="(n, k) in r.review.heat" :key="k" class="hbar" :class="{ hot: inSegment(r, k) }" :title="`${fmt(k * r.review.bin)} 起 ${n} 人回看`">
                  <div :style="{ height: `${(n / maxOf(r.review.heat)) * 100}%` }" />
                </div>
              </div>
              <div v-if="r.rooms.length" class="spans">
                <div v-for="s in roomSpans(r)" :key="s.title" class="span" :style="{ left: `${s.left}%`, width: `${s.width}%` }" :title="`${s.title} ${fmt(s.start)}–${fmt(s.end)}`">{{ s.title }}</div>
              </div>
              <ol class="segs">
                <li v-for="sg in r.review.segments" :key="sg.from">
                  <b class="mono">{{ fmt(sg.from) }}–{{ fmt(sg.to) }}</b> {{ sg.room ? `「${sg.room}」` : '' }}
                  <span class="muted small">{{ sg.viewers }} 人回看 · 累计 {{ fmt(sg.seconds) }}</span>
                  <ElTag v-for="x in sg.reasons" :key="x" size="small" type="danger" effect="plain" class="reason">{{ x }}</ElTag>
                </li>
              </ol>
            </template>
            <p v-else class="muted small">暂无回看进度数据。观众在回放城里看完整回放、看讲解片段、复活看封印片段后，这里会标出大家反复回看的段落。</p>
          </div>
        </div>

        <h4 class="group">互动与掌握</h4>
        <div class="grid">
          <div class="card wide">
            <h4>弹幕热度 <span class="muted">（每分钟，共 {{ r.chat.messages }} 条 / {{ r.chat.speakers }} 人；提问 {{ r.chat.questions }}、购买意向 {{ r.chat.intent }}、没听懂 {{ r.chat.confused }}）</span></h4>
            <div class="heat">
              <div v-for="(n, m) in r.chat.heat" :key="m" class="hbar" :class="{ peak: r.chat.peak?.minute === m }" :title="`第 ${m + 1} 分钟 ${n} 条`">
                <div :style="{ height: `${(n / maxOf(r.chat.heat)) * 100}%` }" />
              </div>
            </div>
            <div v-if="r.rooms.length" class="spans">
              <div v-for="s in roomSpans(r)" :key="s.title" class="span" :style="{ left: `${s.left}%`, width: `${s.width}%` }" :title="`${s.title} ${fmt(s.start)}–${fmt(s.end)}`">{{ s.title }}</div>
            </div>
          </div>
        </div>

        <div class="grid">
          <div v-if="r.rooms.length" class="card">
            <h4>{{ rep.channel.scene === 'commerce' ? '商品段' : '知识段' }}答题错误率 <span class="muted">（回放城殿室）</span></h4>
            <div v-for="rm in r.rooms" :key="rm.title" class="hrow">
              <span class="hname" :title="rm.title">{{ rm.title }}</span>
              <div class="track"><div class="fill" :style="{ width: `${rm.failRate * 100}%`, background: rm.failRate >= 0.5 ? 'var(--cinnabar)' : rm.failRate >= 0.3 ? 'var(--gold)' : 'var(--jade)' }" /></div>
              <span class="mono small">{{ pct(rm.failRate) }}</span>
            </div>
          </div>
          <div class="card">
            <h4>弹幕关注点</h4>
            <div v-for="[name, n] in topicsOf(r)" :key="name" class="hrow">
              <span class="hname">{{ name }}</span>
              <div class="track"><div class="fill" :style="{ width: `${(n / maxOf(topicsOf(r).map(t => t[1]))) * 100}%` }" /></div>
              <span class="mono small">{{ n }}</span>
            </div>
            <p v-if="!topicsOf(r).length" class="muted small">没有命中关注点关键词的弹幕。</p>
          </div>
          <div v-if="r.faq.length" class="card">
            <h4>高频疑问 <span class="muted">（共 {{ r.faqTotal }} 人次）</span></h4>
            <ol class="faq"><li v-for="f in r.faq" :key="f.question">{{ f.question }} <span class="muted small">{{ f.count }} 人次 · {{ fmt(f.sourceTime) }}</span></li></ol>
          </div>
        </div>

        <div class="grid">
          <div class="card wide">
            <h4>答题卡 <span class="muted">（{{ r.quiz.count }} 张，平均参与率 {{ pct(r.quiz.participation) }}，正确率 {{ pct(r.quiz.correctRate) }}）</span></h4>
            <ElTable v-if="r.quiz.cards.length" :data="r.quiz.cards" size="small">
              <ElTableColumn label="发题" width="70"><template #default="{ row }">{{ row.offset === null ? '—' : fmt(row.offset) }}</template></ElTableColumn>
              <ElTableColumn prop="title" label="题目" min-width="220" show-overflow-tooltip />
              <ElTableColumn prop="room" label="所在段" min-width="120" show-overflow-tooltip />
              <ElTableColumn prop="total" label="作答" width="60" />
              <ElTableColumn label="正确率" width="80">
                <template #default="{ row }"><span :style="{ color: (row.correctRate ?? 1) < 0.6 ? 'var(--cinnabar)' : 'inherit' }">{{ pct(row.correctRate) }}</span></template>
              </ElTableColumn>
            </ElTable>
            <p v-else class="muted small">这一{{ unit }}没有发答题卡。</p>
          </div>
          <div class="card">
            <h4>问卷 <span class="muted">（{{ r.questionnaire.submitters }} 人提交，反馈率 {{ pct(r.questionnaire.rate) }}）</span></h4>
            <div v-for="q in r.questionnaire.questions" :key="q.name" class="q">
              <div class="small">{{ q.name }} <span class="muted">{{ QTYPE[q.type] || q.type }} · {{ q.answers }} 人</span></div>
              <div v-if="q.options.length" class="opts">
                <span v-for="o in q.options" :key="o.key" class="opt" :title="`选项 ${o.key}：${o.count} 人`">
                  <i :style="{ width: `${(o.count / maxOf(q.options.map(x => x.count))) * 100}%` }" />{{ o.key }} · {{ o.count }}
                </span>
              </div>
            </div>
            <p v-if="!r.questionnaire.questions.length" class="muted small">这一{{ unit }}没有问卷数据。</p>
            <p v-else class="muted small">开放接口只返回选项字母；打分题按 A–E 对应 1–5 分计算满意度。</p>
          </div>
        </div>
      </template>
      <p v-else class="muted small">到频道页点「生成」后会拉取这一{{ unit }}的观看、聊天、答题卡和问卷数据。</p>
    </section>
  </template>
</template>

<style scoped>
h2 { margin: 6px 0 4px; }
h3 { margin: 0; font-size: 16px; }
h4 { margin: 14px 0 8px; font-size: 13px; color: var(--gold-2); font-weight: 500; }
.small { font-size: 12px; }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.head p { margin: 0; }
.bar { display: flex; gap: 8px; }
.bar :deep(.el-button + .el-button) { margin-left: 0; }
.alert { margin-top: 16px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 18px 0; }
.kpi { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
.kpi b { font-size: 24px; color: var(--gold-2); font-weight: 600; }
.kpi small { font-size: 13px; color: var(--muted); }
.kpi span { font-size: 13px; }
.kpi em { font-style: normal; font-size: 11px; color: var(--muted); }
.dims { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.dim { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 16px 18px; }
.dim.primary { border-color: var(--gold); }
.dim-head { display: flex; gap: 16px; align-items: center; }
.dim-head p { margin: 4px 0 0; }
.ring { width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; flex: none; }
.ring > div { width: 74px; height: 74px; border-radius: 50%; background: var(--panel); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ring b { font-size: 26px; line-height: 1; }
.ring span { font-size: 11px; color: var(--muted); margin-top: 4px; }
.indicators { margin-top: 14px; display: grid; gap: 8px; }
.ind { display: grid; grid-template-columns: 130px minmax(0, 1fr) 64px 44px; gap: 10px; align-items: center; font-size: 13px; cursor: help; }
.ind i { font-style: normal; font-size: 11px; }
.ind-val { text-align: right; font-size: 12px; }
.ind-lv { font-size: 12px; }
.track { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
.fill { height: 100%; background: var(--gold); border-radius: 3px; }
ul, ol { margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 16px 18px; margin-top: 16px; }
.ai p { line-height: 1.8; margin: 8px 0 0; }
.ai h4 { margin: 18px 0 8px; }
.verdict { font-size: 22px; margin-top: 10px !important; }
.diag { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
.diag-card { background: var(--panel-2); border: 1px solid var(--line); border-left: 3px solid var(--cinnabar); border-radius: 4px; padding: 10px 14px; }
.diag-head { display: flex; gap: 8px; align-items: center; }
.diag dl { margin: 8px 0 0; display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 4px 8px; font-size: 13px; line-height: 1.7; }
.diag dt { color: var(--muted); }
.diag dd { margin: 0; }
.moments { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.7; }
.moments th, .moments td { border-bottom: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; }
.moments th { color: var(--muted); font-weight: 400; }
.nowrap { white-space: nowrap; }
.plan { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; }
.plan-group { background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 10px 14px; }
.stage { color: var(--gold-2); font-size: 13px; margin-bottom: 6px; }
.plan-item { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; line-height: 1.7; margin-bottom: 6px; }
.check { list-style: none; padding-left: 0; }
.ai-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.section-title { margin: 28px 0 0; font-size: 18px; }
.replay-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 12px; }
.card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 4px 14px 14px; min-width: 0; }
.card.wide { grid-column: span 2; }
.bars { display: flex; gap: 12px; height: 130px; align-items: flex-end; }
.vbar { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; font-size: 11px; }
.vfill { width: 70%; background: var(--gold); border-radius: 2px 2px 0 0; min-height: 2px; }
.vbar b { margin-top: 4px; font-size: 12px; }
.vbar span { color: var(--muted); }
.heat { display: flex; gap: 2px; height: 100px; align-items: flex-end; }
.hbar { flex: 1; height: 100%; display: flex; align-items: flex-end; }
.hbar > div { width: 100%; background: var(--jade); opacity: 0.7; min-height: 1px; border-radius: 1px 1px 0 0; }
.hbar.peak > div { background: var(--cinnabar); opacity: 1; }
.hbar.hot > div { background: var(--gold); opacity: 1; }
.group { margin: 18px 0 0; font-size: 14px; color: var(--text, inherit); border-left: 3px solid var(--gold); padding-left: 8px; }
.bars.short { height: 80px; }
.vfill.jade { background: var(--jade); }
.segs { margin-top: 10px; }
.segs li { font-size: 13px; }
.reason { margin-left: 6px; }
.spans { position: relative; height: 22px; margin-top: 4px; }
.span { position: absolute; top: 0; height: 100%; border-left: 1px solid var(--line); font-size: 11px; color: var(--muted); padding: 3px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hrow { display: grid; grid-template-columns: 120px minmax(0, 1fr) 44px; gap: 8px; align-items: center; margin: 6px 0; font-size: 12px; }
.hname { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.faq li { font-size: 12px; line-height: 1.7; }
.q { margin-bottom: 10px; }
.opts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.opt { position: relative; font-size: 11px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 3px; overflow: hidden; min-width: 54px; }
.opt i { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(201, 164, 92, 0.25); z-index: 0; }
.error { color: var(--cinnabar); }
@media (max-width: 1100px) { .dims, .ai-cols { grid-template-columns: 1fr; } .card.wide { grid-column: auto; } }
@media print {
  .no-print { display: none !important; }
  .dim, .panel, .kpi, .card { break-inside: avoid; }
}
</style>
