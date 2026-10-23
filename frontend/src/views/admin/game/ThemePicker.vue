<script setup lang="ts">
// 地宫主题模版选择：每套主题用游戏里同一份绘制函数画出墙、地、装饰三张贴图做预览
import { onMounted, ref } from 'vue'
import { THEMES, paintPreview } from '@/game/nightcity/themes'
import type { ThemeKey } from '@/types/game'

const props = defineProps<{ only?: ThemeKey }>() // 只展示某一套（展示模式）
const model = defineModel<ThemeKey>()
const keys = (props.only ? [props.only] : Object.keys(THEMES)) as ThemeKey[]
const canvases = ref<Record<string, HTMLCanvasElement[]>>({})

const setRef = (k: string, i: number) => (el: unknown) => {
  if (!el) return
  ;(canvases.value[k] ||= [])[i] = el as HTMLCanvasElement
}
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')

onMounted(() => {
  for (const k of keys) {
    const t = THEMES[k]
    ;[t.wall, t.floor, t.panel].forEach((paint, i) => { const c = canvases.value[k]?.[i]; if (c) paintPreview(c, paint) })
  }
})
</script>

<template>
  <div :class="['themes', { single: only }]">
    <button v-for="k in keys" :key="k" type="button" :class="['theme', { on: !only && model === k }]" :disabled="!!only" @click="model = k">
      <div class="tex" :style="{ background: hex(THEMES[k].fog[0]) }">
        <canvas v-for="i in 3" :key="i" :ref="setRef(k, i - 1)" />
        <span class="lamp" :style="{ background: hex(THEMES[k].lamp.color), boxShadow: `0 0 10px ${hex(THEMES[k].lamp.color)}` }" />
      </div>
      <div class="name">{{ THEMES[k].name }}</div>
      <div class="desc">{{ THEMES[k].desc }}</div>
      <div class="words">怪：{{ THEMES[k].words.beast }} · Boss：{{ THEMES[k].words.boss.course }} · 出口：{{ THEMES[k].words.portal }}</div>
    </button>
  </div>
</template>

<style scoped>
.themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.themes.single { grid-template-columns: minmax(0, 360px); }
.theme { text-align: left; font: inherit; color: var(--text); background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 8px; cursor: pointer; }
.theme:disabled { cursor: default; }
.theme.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.tex { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 6px; border-radius: 3px; }
.tex canvas { width: 100%; aspect-ratio: 1; image-rendering: pixelated; border-radius: 2px; }
.lamp { position: absolute; right: 8px; top: 8px; width: 8px; height: 8px; border-radius: 50%; }
.name { margin-top: 6px; font-weight: 600; }
.desc { font-size: 12px; color: var(--muted); line-height: 1.5; margin-top: 2px; }
.words { font-size: 11px; color: var(--muted); margin-top: 4px; }
</style>
