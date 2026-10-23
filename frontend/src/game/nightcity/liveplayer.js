// 回放播放：保利威直播 Web 播放器（公开 SDK，帮助中心 live/js/live_player），用 vodsrc 播回放。
// 包成和 <video> 差不多的接口（currentTime / play / pause / paused / readyState / timeupdate…），引擎按原样调用。
// 测试环境的频道只在 develop-N 环境存在，domainInfo 由后端按 POLYV_API_BASE 下发，换成对应环境的域名。
const SDK = 'https://player.polyv.net/resp/live-h5-player/latest/liveplayer.min.js'
let sdk = null

function loadSdk() {
  if (window.polyvLivePlayer) return Promise.resolve()
  if (!sdk) {
    sdk = new Promise((ok, no) => {
      const s = document.createElement('script')
      s.src = SDK
      s.onload = ok
      s.onerror = () => { sdk = null; no(new Error('直播播放器 SDK 加载失败')) }
      document.head.appendChild(s)
    })
  }
  return sdk
}

export class LiveVideo {
  /** cfg: { uid, channelId, domainInfo, viewerId, nickname }；src: 回放地址（m3u8 / mp4） */
  constructor(wrap, cfg, src, { autoplay = true } = {}) {
    Object.assign(this, { wrap, src, paused: true, readyState: 0, duration: 0, _t: 0, _ls: {}, _seek: null, _wantPlay: autoplay, _dead: false })
    loadSdk().then(() => {
      if (this._dead) return
      wrap.innerHTML = '<div style="width:100%;height:100%"></div>'
      const p = window.polyvLivePlayer({
        wrap: wrap.firstChild, width: '100%', height: '100%', uid: cfg.uid, vid: cfg.channelId, vodsrc: src,
        autoplay, domainInfo: cfg.domainInfo, param1: cfg.viewerId || '', param2: cfg.nickname || ''
      })
      this.p = p
      p.on('s2j_onPlay', () => { this.paused = false })
      p.on('s2j_onPause', () => { this.paused = true })
      p.on('s2j_onOver', () => { this.paused = true })
      this._timer = setInterval(() => this._tick(), 250)
    }).catch(e => { wrap.innerHTML = '<div class="tiny" style="padding:12px;color:#e9b7a8">' + e.message + '</div>' })
  }

  _tick() {
    const p = this.p
    let d = 0, t
    try { d = p.getDuration() || 0 } catch { /* 播放器还没就绪 */ }
    if (!this.readyState && d > 0) {
      this.readyState = 1
      this.duration = d
      if (this._seek !== null) { try { p.j2s_seekVideo(this._seek) } catch { /* 忽略 */ } this._seek = null }
      if (this._wantPlay) try { p.j2s_resumeVideo() } catch { /* 忽略 */ }
      this._emit('loadedmetadata')
    }
    try { t = p.j2s_getCurrentTime() } catch { /* 忽略 */ }
    if (typeof t === 'number' && t !== this._t) { this._t = t; this._emit('timeupdate') }
  }

  get currentTime() { return this._t }
  set currentTime(v) {
    this._emit('seeking')
    this._t = v
    if (this.readyState) { try { this.p.j2s_seekVideo(v) } catch { /* 忽略 */ } } else this._seek = v
  }

  play() {
    this._wantPlay = true
    if (this.p && this.readyState) try { this.p.j2s_resumeVideo() } catch { /* 忽略 */ }
    return Promise.resolve()
  }

  pause() {
    this._wantPlay = false
    if (this.p) try { this.p.j2s_pauseVideo() } catch { /* 忽略 */ }
    this.paused = true
  }

  addEventListener(ev, fn, opts) { (this._ls[ev] = this._ls[ev] || []).push({ fn, once: !!(opts && opts.once) }) }

  _emit(ev) {
    const ls = this._ls[ev] || []
    this._ls[ev] = ls.filter(l => !l.once)
    ls.forEach(l => l.fn())
  }

  destroy() {
    this._dead = true
    clearInterval(this._timer)
    if (this.p) try { this.p.destroy() } catch { /* 忽略 */ }
    this.p = null
    this.wrap.innerHTML = ''
  }
}
