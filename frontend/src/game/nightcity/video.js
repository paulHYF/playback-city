// 回放播放：m3u8 用 hls.js（Safari 原生支持就直接用），mp4 直接给 src。
import Hls from 'hls.js'

const attached = new WeakMap() // video → { src, hls }

export function attachVideo(video, src) {
  const cur = attached.get(video)
  if (cur && cur.src === src) return
  detachVideo(video)
  if (!src) return
  if (/\.m3u8(\?|$)/.test(src) && !video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 20 })
    hls.loadSource(src)
    hls.attachMedia(video)
    attached.set(video, { src, hls })
  } else {
    video.src = src
    attached.set(video, { src, hls: null })
  }
}

export function detachVideo(video) {
  const cur = attached.get(video)
  video.pause()
  if (cur && cur.hls) cur.hls.destroy()
  video.removeAttribute('src')
  video.load()
  attached.delete(video)
}
