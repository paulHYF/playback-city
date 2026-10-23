<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElForm, ElFormItem, ElInput, ElMessage, ElRadioButton, ElRadioGroup, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { api } from '@/api'
import type { ChannelSummary } from '@/types/city'
import type { Scene } from '@/types/game'
import { SCENE_NAME } from '@/utils'

const router = useRouter()
const channels = ref<ChannelSummary[]>([])
const channelId = ref('')
const scene = ref<Scene>('course')
const importing = ref(false)

const load = async () => (channels.value = await api.channels())
onMounted(load)

async function doImport() {
  const cid = channelId.value.trim()
  if (!/^\d+$/.test(cid)) {
    ElMessage.warning('频道号是纯数字')
    return
  }
  importing.value = true
  try {
    const r = await api.importChannel(cid, scene.value)
    ElMessage.success(`导入完成：${r.replays} 讲回放（回放列表 ${r.playbacks}，暂存 ${r.recordFiles}）`)
    router.push(`/admin/channels/${cid}`)
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <h2>按频道号导入</h2>
  <p class="muted">调用直播开放接口拉取频道信息、回放列表与暂存列表，形成回放基础信息页；之后逐讲生成密室，再生成整城。</p>
  <ElForm inline class="form" @submit.prevent="doImport">
    <ElFormItem label="频道号">
      <ElInput v-model="channelId" placeholder="如 8655755" clearable style="width: 200px" />
    </ElFormItem>
    <ElFormItem label="场景">
      <ElRadioGroup v-model="scene">
        <ElRadioButton value="course">课程培训</ElRadioButton>
        <ElRadioButton value="commerce">直播带货</ElRadioButton>
      </ElRadioGroup>
    </ElFormItem>
    <ElFormItem>
      <ElButton type="primary" native-type="submit" :loading="importing">导入</ElButton>
    </ElFormItem>
  </ElForm>

  <h3>已导入的城</h3>
  <ElTable :data="channels" empty-text="还没有导入频道" @row-click="(r: ChannelSummary) => router.push(`/admin/channels/${r.channel_id}`)">
    <ElTableColumn prop="channel_id" label="频道号" width="110" />
    <ElTableColumn prop="name" label="频道名称" min-width="180" />
    <ElTableColumn label="场景" width="100">
      <template #default="{ row }">{{ SCENE_NAME[row.scene as Scene] }}</template>
    </ElTableColumn>
    <ElTableColumn label="回放 / 已生成" width="130">
      <template #default="{ row }">{{ row.replays }} / {{ row.ready || 0 }}</template>
    </ElTableColumn>
    <ElTableColumn label="整城" width="100">
      <template #default="{ row }">
        <ElTag :type="row.city_status === 'ready' ? 'success' : row.city_status === 'failed' ? 'danger' : 'info'" size="small">
          {{ { none: '未生成', generating: '生成中', ready: '已生成', failed: '失败' }[row.city_status as string] }}
        </ElTag>
      </template>
    </ElTableColumn>
  </ElTable>
</template>

<style scoped>
h2 { margin: 0 0 6px; }
h3 { margin: 28px 0 10px; }
.form { margin-top: 16px; }
:deep(.el-table__row) { cursor: pointer; }
</style>
