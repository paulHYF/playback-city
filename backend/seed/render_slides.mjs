// 用 Playwright 自带的 Chromium 渲染幻灯片：每页一张 PNG + 整套 PDF。
// 不调用本机 Chrome，避免和用户正在使用的浏览器抢占配置目录。
//   node seed/render_slides.mjs <slides.html> <输出目录> <页数>
const { getChromium } = await import(process.env.POLYV_TEST_KNOWLEDGE + '/scripts/playwright-env.mjs')
const [html, outDir, count] = process.argv.slice(2)
const chromium = await getChromium()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
for (let i = 0; i < Number(count); i++) {
  await page.goto(`file://${html}?i=${i}`)
  await page.screenshot({ path: `${outDir}/${String(i).padStart(2, '0')}.png` })
}
await page.goto(`file://${html}?all=1`)
await page.pdf({ path: `${outDir}/../slides.pdf`, width: '1280px', height: '720px', printBackground: true })
await browser.close()
