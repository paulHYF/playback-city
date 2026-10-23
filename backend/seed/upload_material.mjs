#!/usr/bin/env node
/**
 * 登录 develop-3 直播后台，把 mp4 上传到素材库，等转码完成后输出 materialId。
 * 素材库没有上传类开放接口，只能走后台页面；登录与上传套路见
 * dev-knowledge/.claude/skills/polyv-test-flow/references/test-access.md。
 *
 *   node seed/upload_material.mjs seed/out/course/course.mp4
 */
import path from 'node:path'

const { login } = await import(process.env.POLYV_TEST_KNOWLEDGE + '/scripts/polyv-test-login.mjs')
const MP4 = path.resolve(process.argv[2])
const NAME = path.basename(MP4, '.mp4')

const { ctx, page, token, apiBase } = await login({ env: 'develop-3', route: '#/admin/material-library/management/video' })
const api = async (p) => (await page.request.get(apiBase + p, { headers: { 'x-auth-token': token } })).json()

let materialId
page.on('response', async (r) => {
  if (!/applyVideoUploadToken|saveMaterial/.test(r.url())) return
  const m = (await r.text().catch(() => '')).match(/"data"\s*:\s*"([a-f0-9]{16,})"/)
  if (m) materialId = m[1]
})

await page.waitForTimeout(3000)
const upload = page.locator('button:has-text("上传视频")')
if (!(await upload.count())) {
  const shot = path.resolve('seed/out/upload-debug.png')
  await page.screenshot({ path: shot, fullPage: true })
  console.log('没找到「上传视频」按钮，当前页面', page.url(), '截图', shot)
  await ctx.close()
  process.exit(1)
}
await upload.first().click()
await page.waitForSelector('.c-material-upload-dialog', { timeout: 10000 })
await (await page.$('.c-material-upload-dialog input[type=file]')).setInputFiles(MP4)
console.log('上传中', NAME)

for (let i = 0; i < 120 && !materialId; i++) await page.waitForTimeout(1000)
if (!materialId) throw new Error('没拿到 materialId：检查是否触发了 applyVideoUploadToken')
console.log('materialId', materialId)

// 等上传 + 转码：在默认分类里找到这条素材并打印状态
const cats = await api('/live-bg/v3/user/material/category/list')
const cat = (cats.data || []).find(c => c.type === 'DEFAULT') || (cats.data || [])[0]
for (let i = 0; i < 90; i++) {
  const list = await api(`/live-bg/v3/user/material/list?categoryId=${cat.id}&type=video&page=1&pageSize=20`)
  const item = (list.data?.contents || []).find(m => m.materialId === materialId || m.id === materialId)
  if (item) {
    console.log('状态', JSON.stringify({ status: item.status, transcodeStatus: item.transcodeStatus, duration: item.duration }))
    if (['normal', 'success', 'finish', 'FINISH', 'NORMAL'].includes(item.status ?? item.transcodeStatus)) break
  }
  await page.waitForTimeout(10000)
}
await ctx.close()
console.log(JSON.stringify({ name: NAME, materialId }))
