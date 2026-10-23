<script setup lang="ts">
// 回放时间点输入：显示 mm:ss，可输入 mm:ss、h:mm:ss 或秒数，失焦时换算成秒
import { ref, watch } from 'vue'
import { ElInput } from 'element-plus'
import { fmt } from '@/utils'

const model = defineModel<number>({ required: true })
const text = ref(fmt(model.value))
watch(model, v => (text.value = fmt(v)))

function commit() {
  const parts = text.value.trim().split(':').map(Number)
  if (!parts.length || parts.some(n => !Number.isFinite(n) || n < 0) || parts.length > 3) {
    text.value = fmt(model.value)
    return
  }
  model.value = parts.reduce((s, n) => s * 60 + n, 0)
  text.value = fmt(model.value)
}
</script>

<template>
  <ElInput v-model="text" class="time" placeholder="mm:ss" @blur="commit" @keyup.enter="commit" />
</template>

<style scoped>
.time { width: 96px; font-family: var(--mono); }
</style>
