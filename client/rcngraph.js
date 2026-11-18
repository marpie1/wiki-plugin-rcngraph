(function () {

  // BEGIN rcn-lineup-follow — pasted from tools/rcn-lineup-follow.js by tools/paste-lineup-follow.js. Edit that file, never this block.
  /* rcn-lineup-follow — the timeline, map and drawing items on a wiki page follow
   * each other, across the whole lineup and into the full tools open in other tabs.
   *
   * ONE SOURCE. tools/paste-lineup-follow.js pastes this file into the three
   * plugins (rcntimeline, rcnmap, rcngraph) between the BEGIN/END marker lines,
   * so each plugin stays one file. Edit this file, then run
   *   node tools/paste-lineup-follow.js
   *
   * WHY IT IS EASY ON A WIKI. A FedWiki lineup is one browser document: every
   * page beside the others is a .page inside .main, even pages from other sites.
   * So items on different pages can call each other directly. The first plugin
   * to load makes window.rcnLineup; the others use it.
   *
   * WHAT GOES OUT. The same two messages the full tools send (tools/rcn-switch.js):
   *   { type:'rcn-walk',   src, lead, k, all, label, ids, places, eips }   a walk step
   *   { type:'rcn-walk',   src, lead, k, end:true }                        the walk stopped
   *   { type:'rcn-follow', src, k, click:true, id, place, eip, ids, places, eips, clear? }
   * ids are timeline bars, places map points, eips drawing nodes. The sender
   * widens what it lights one hop through every timeline in the lineup: each bar
   * names a place and a node, so a map step on the Magma mine lights the Magma
   * bars and the Magma Copper box. x:1 marks a message already widened.
   *
   * HOW IT TRAVELS. As a bubbling DOM event 'rcnwalkStream' from the item (the
   * naming FedWiki's Frame plugin uses for its LINEUP topics), heard once at the
   * document and handed to every joined item but the sender; and over the
   * BroadcastChannel 'rcn-follow', where the full tools of the same site listen.
   *
   * Marc Pierson with Claude Opus 5.5, Nov 2026. MIT licence.
   */
  const RL = (function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null
    if (window.rcnLineup) return window.rcnLineup
    const R = window.rcnLineup = { v: 1, members: [], heard: {} }
    const CH = ('BroadcastChannel' in window) ? new BroadcastChannel('rcn-follow') : null
    const none = () => ({ ids: [], places: [], eips: [] })

    // The bridges: every bar of every timeline item in the lineup.
    R.bars = function () {
      const out = []
      document.querySelectorAll('.rcntimeline-source').forEach(el => {
        if (!el.timelineData) return
        try {
          (el.timelineData().intervals || []).forEach(iv => {
            const x = iv.extra || {}
            out.push({ id: String(iv.id), place: iv.place || x.place || null, eip: iv.eip || x.eip || null })
          })
        } catch (e) {}
      })
      return out
    }
    // One hop: a bar named, or at a lit place, or about a lit node, adds its bar, place and node.
    R.expand = function (o) {
      const I = {}, P = {}, E = {}, i0 = {}, p0 = {}, e0 = {}
      ;(o.ids || []).filter(Boolean).forEach(x => { I[x] = i0[x] = 1 })
      ;(o.places || []).filter(Boolean).forEach(x => { P[x] = p0[x] = 1 })
      ;(o.eips || []).filter(Boolean).forEach(x => { E[x] = e0[x] = 1 })
      R.bars().forEach(b => {
        if (i0[b.id] || (b.place && p0[b.place]) || (b.eip && e0[b.eip])) {
          I[b.id] = 1; if (b.place) P[b.place] = 1; if (b.eip) E[b.eip] = 1
        }
      })
      return { ids: Object.keys(I), places: Object.keys(P), eips: Object.keys(E) }
    }

    // An item joins: fn(m) hears the others and returns true when it lit something.
    // Joining again (a redraw) replaces the item's old listener.
    R.join = function (el, src, fn) {
      R.members = R.members.filter(x => x.el !== el && document.contains(x.el))
      R.members.push({ el, src, fn })
    }
    R.others = el => R.members.filter(x => x.el !== el && document.contains(x.el)).length

    function deliver (m, fromEl) {
      if (!m || !m.k || R.heard[m.k]) return 0
      R.heard[m.k] = 1
      R.members = R.members.filter(x => document.contains(x.el))
      let n = 0
      R.members.slice().forEach(x => {
        if (x.el === fromEl) return
        try { if (x.fn(m)) n++ } catch (e) { console.warn('rcn-lineup-follow:', e) }
      })
      return n
    }
    // Returns how many items in this lineup lit something.
    function send (el, m) {
      m.k = Date.now() + ':' + Math.random()
      let n = 0
      try {
        const ev = new CustomEvent('rcnwalkStream', { bubbles: true, detail: m })
        el.dispatchEvent(ev)
        n = ev.rcnLit || 0
      } catch (e) {}
      try { if (CH) CH.postMessage(m) } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('rcn-walk-local', { detail: m })) } catch (e) {}   // the video recorder
      return n
    }
    document.addEventListener('rcnwalkStream', e => { e.rcnLit = deliver(e.detail, e.target) })
    // The full tools in other tabs: their walks come widened through their set;
    // their clicks name one thing, so widen those here.
    if (CH) CH.addEventListener('message', ev => {
      const m = ev.data
      if (!m || !m.k) return
      if (m.type === 'rcn-walk') { deliver(m, null); return }
      if (m.type !== 'rcn-follow' || !m.click) return
      if (m.x) { deliver(m, null); return }
      const x = m.id ? R.expand({ ids: m.src === 'timeline' ? [m.id] : [], places: [m.place], eips: [m.eip] }) : none()
      deliver(Object.assign({}, m, x, { x: 1, clear: !m.id }), null)
    })

    // A step of this item's walk. o: {ids|places|eips: [...], all, label}
    R.step = function (el, src, o) {
      if (!el.rcnLead) el.rcnLead = src + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      const x = o.all ? none() : R.expand(o)
      return send(el, Object.assign({ type: 'rcn-walk', src, lead: el.rcnLead, all: !!o.all, pointer: false, label: o.label || null, x: 1 }, x))
    }
    // This item's walk has read its last step (it stays open there). Only the
    // video recorder (tools/rcn-record.js) listens; the items don't follow it.
    R.done = function (el, src) {
      if (!el.rcnLead) return
      const m = { type: 'rcn-walk-done', src, lead: el.rcnLead, k: Date.now() + ':' + Math.random() }
      try { if (CH) CH.postMessage(m) } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('rcn-walk-local', { detail: m })) } catch (e) {}
    }
    // This item's walk stopped. Sends nothing if it was not leading.
    R.end = function (el, src) {
      if (!el.rcnLead) return
      const lead = el.rcnLead
      el.rcnLead = null
      send(el, { type: 'rcn-walk', src, lead, end: true })
    }
    // A click on one thing, or {clear:true} to let go. o: {id} for a bar (it
    // lights the bar's own place and node), {place} for a map point (the bars there
    // and their nodes), {eip} for a drawing box (the bars about it and their places).
    // Returns how many items in this lineup lit something.
    R.click = function (el, src, o) {
      el.rcnClicked = !o.clear
      const x = o.clear ? none() : R.expand({ ids: o.id ? [o.id] : [], places: [o.place], eips: [o.eip] })
      const bar = o.id && R.bars().find(b => b.id === String(o.id))
      return send(el, Object.assign({ type: 'rcn-follow', src, click: true, clear: !!o.clear,
        id: o.clear ? null : (o.id || o.place || o.eip || null), label: o.label || null,
        place: o.place || (bar && bar.place) || null, eip: o.eip || (bar && bar.eip) || null, x: 1 }, x))
    }

    // A follower's state after hearing m. f: {lead, lit:Set|null, seen:Set, click}
    // or null. mine: the ids of this item that m names. Returns the new state; the
    // same object means nothing changes (a step about nothing here leaves it be).
    R.update = function (f, m, mine) {
      if (m.type === 'rcn-walk' && m.end) return f && f.lead === m.lead ? null : f
      if (m.type === 'rcn-follow' && m.clear) return f && f.click ? null : f
      const same = f && m.lead && f.lead === m.lead
      if (m.all) return { lead: m.lead || null, lit: null, seen: same ? f.seen : new Set(), click: false }
      if (!mine.length) return f
      const seen = same ? new Set([...f.seen, ...(f.lit || [])]) : new Set()
      return { lead: m.lead || null, lit: new Set(mine), seen, click: m.type === 'rcn-follow' }
    }
    // How strongly to draw one thing: lit full, seen half, the rest faded
    // (less faded after a click than in a walk).
    R.op = function (f, id) {
      if (!f || !f.lit || f.lit.has(id)) return 1
      if (f.seen.has(id)) return 0.42
      return f.click ? 0.3 : 0.13
    }
    // Whole or Step, item by item (Nov 17 2026), the same choice as the explorer's
    // panes (tools/rcn-together.html). Step: a walk — this item's or one it
    // follows — zooms the item to each step. Whole: the item shows the whole
    // timeline, map or drawing and stays where you put it; steps light things in
    // place, and you pan and zoom by hand. A click elsewhere still brings the item
    // to what was clicked. ⤢ shows the whole thing again. Each kind of item
    // (timeline, map, sketch) remembers its last choice in this browser.
    const FRAME_KEY = 'rcnLineupFrame'
    const frameSaved = () => { try { return JSON.parse(localStorage.getItem(FRAME_KEY)) || {} } catch (e) { return {} } }
    R.frame = el => el.rcnFrame || (el.rcnFrame = frameSaved()[el.rcnKind] === 'whole' ? 'whole' : 'step')
    R.whole = el => R.frame(el) === 'whole'
    const frameHTML = fr => {
      const b = 'font:inherit;font-size:12px;border:0;padding:2px 8px;cursor:pointer;'
      const on = 'background:#4f46e5;color:#fff;', off = 'background:#fff;color:#334155;'
      return `<button data-fr="whole" style="${b}${fr === 'whole' ? on : off}" title="Show the whole thing; a walk lights things where they are and leaves the view to you. Drag to pan, pinch or ⌘-scroll to zoom.">Whole</button>` +
        `<button data-fr="step" style="${b}border-left:1px solid #cbd5e1;${fr === 'step' ? on : off}" title="Zoom in on each step of a walk">Step</button>` +
        (fr === 'whole' ? `<button data-fr="fit" style="${b}border-left:1px solid #cbd5e1;${off}" title="Show the whole thing again">⤢</button>` : '')
    }
    // The switch, for an item's button row. kind: 'timeline' | 'map' | 'sketch'.
    R.frameSwitch = kind => `<span class="rcn-frame" data-kind="${kind}" style="display:inline-flex;vertical-align:middle;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden" role="group" aria-label="During a walk"></span>`
    // Wire an item's switch. fn(frame, fit) redraws the item for the new choice.
    R.bindFrame = function (el, kind, fn) {
      el.rcnKind = kind
      const draw = () => el.querySelectorAll('.rcn-frame').forEach(s => { s.innerHTML = frameHTML(R.frame(el)) })
      draw()
      if (el.rcnFrameBound) { el.rcnFrameFn = fn; return }
      el.rcnFrameBound = true; el.rcnFrameFn = fn
      el.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('.rcn-frame button')
        if (!b) return
        e.stopPropagation()
        const v = b.dataset.fr, was = R.frame(el)
        if (v !== 'fit') {
          el.rcnFrame = v
          const s = frameSaved(); s[kind] = v
          try { localStorage.setItem(FRAME_KEY, JSON.stringify(s)) } catch (err) {}
        }
        el.querySelectorAll('.rcn-frame').forEach(s => { s.innerHTML = frameHTML(R.frame(el)) })
        if (v === 'fit' || v !== was) try { el.rcnFrameFn(R.frame(el), v === 'fit') } catch (err) { console.warn('rcn-frame:', err) }
      })
    }
    // Hand pan and zoom on an element, for items without their own (the timeline
    // and the drawing; the map has Leaflet's). Only while on() says so. Drag pans,
    // pinch or ⌘/Ctrl-scroll zooms about the pointer, double-click shows the whole.
    // A drag swallows the click that ends it, so it never counts as a click on a box.
    // h: {on(), pan(dxPx, dyPx), zoom(factor, xPx, yPx), reset()}; positions are
    // relative to the element's top-left corner.
    R.handView = function (box, h) {
      if (box.rcnHand) { box.rcnHand = h; return }
      box.rcnHand = h
      let drag = null, moved = false
      box.addEventListener('pointerdown', e => {
        if (!box.rcnHand.on() || e.button !== 0) return
        drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; moved = false
      })
      box.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y
        if (!moved && Math.hypot(dx, dy) < 4) return
        if (!moved) { moved = true; try { box.setPointerCapture(e.pointerId) } catch (err) {} box.style.cursor = 'grabbing' }
        drag.x = e.clientX; drag.y = e.clientY
        box.rcnHand.pan(dx, dy)
      })
      const up = () => { if (drag) { drag = null; box.style.cursor = '' } }
      box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up)
      box.addEventListener('click', e => { if (moved) { moved = false; e.stopPropagation(); e.preventDefault() } }, true)
      box.addEventListener('wheel', e => {
        if (!box.rcnHand.on() || !(e.ctrlKey || e.metaKey)) return   // a plain scroll still scrolls the wiki page
        e.preventDefault()
        const r = box.getBoundingClientRect()
        box.rcnHand.zoom(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.002) * (e.ctrlKey ? 10 : 1)), e.clientX - r.left, e.clientY - r.top)   // a pinch arrives as ctrl+wheel in small steps
      }, { passive: false })
      box.addEventListener('dblclick', e => { if (box.rcnHand.on()) { e.preventDefault(); e.stopPropagation(); box.rcnHand.reset() } }, true)
    }
    // Hover text on or off for the whole lineup (Nov 17 2026): the text that pops
    // up when the pointer rests on a bar, a point or a box, in every timeline, map
    // and drawing item at once. Off suits a room watching a walk, where a stray
    // pointer keeps covering the picture. Any item's 💬 button flips it for all;
    // remembered in this browser. body.rcn-lineup-nohover hides the map's
    // tooltips; the timeline and the drawing ask R.hoverOff() and redraw.
    const HOVER_KEY = 'rcnLineupHover', hoverFns = []
    R.hoverOff = () => document.body.classList.contains('rcn-lineup-nohover')
    const hoverHTML = () => {
      const off = R.hoverOff()
      return `💬 Hover text: ${off ? 'off' : 'on'}`
    }
    R.hoverSwitch = () => `<button class="rcn-hover" aria-pressed="${!R.hoverOff()}" style="cursor:pointer;font-size:12px;padding:2px 8px;${R.hoverOff() ? 'color:#64748b;text-decoration:line-through;' : ''}" title="The text that pops up when the pointer rests on a bar, a point or a box, in every timeline, map and drawing on these pages. Turn it off when a room is watching a walk.">${hoverHTML()}</button>`
    // fn(on) redraws an item for the new setting; el is the item, so a removed item is let go.
    R.onHover = (el, fn) => { for (let i = hoverFns.length - 1; i >= 0; i--) if (hoverFns[i].el === el || !document.contains(hoverFns[i].el)) hoverFns.splice(i, 1); hoverFns.push({ el, fn }) }
    const hoverApply = off => {
      document.body.classList.toggle('rcn-lineup-nohover', off)
      document.querySelectorAll('.rcn-hover').forEach(b => { b.outerHTML = R.hoverSwitch() })
      hoverFns.forEach(h => { if (document.contains(h.el)) try { h.fn(!off) } catch (e) { console.warn('rcn-hover:', e) } })
    }
    {
      const css = document.createElement('style')
      css.textContent = 'body.rcn-lineup-nohover .rcnmap .leaflet-tooltip{display:none!important}'
      document.head.appendChild(css)
      let off = false
      try { off = localStorage.getItem(HOVER_KEY) === 'off' } catch (e) {}
      const go = () => document.body.classList.toggle('rcn-lineup-nohover', off)
      if (document.body) go(); else document.addEventListener('DOMContentLoaded', go)
      document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('.rcn-hover')
        if (!b) return
        e.stopPropagation()
        const nowOff = !R.hoverOff()
        try { localStorage.setItem(HOVER_KEY, nowOff ? 'off' : 'on') } catch (err) {}
        hoverApply(nowOff)
      }, true)
      // Another tab of this wiki flipped it: follow.
      window.addEventListener('storage', e => { if (e.key === HOVER_KEY) hoverApply(e.newValue === 'off') })
    }
    // "⧉ Open together": the Time Place Causality Explorer on an item's set file
    // (item.set). A bare file name lives in the site's /assets/NDC/ folder beside
    // the explorer and the full tools; a full address may point anywhere, and the
    // explorer is then looked for in that set's own folder. A local wiki opens the
    // working copy on :8765.
    R.together = function (set) {
      const local = /(^|\.)localhost$/.test(location.hostname)
      const s = new URL(set, location.origin + '/assets/NDC/')
      const page = local ? 'http://localhost:8765/tools/rcn-together.html' : new URL('rcn-together.html', s).href
      return page + '?set=' + encodeURIComponent(new URL(page).origin === s.origin ? s.pathname : s.href)
    }
    R.togetherButton = item => item && typeof item.set === 'string' && item.set.trim()
      ? '<button class="rcn-together" style="cursor:pointer;font-size:12px;padding:2px 8px" title="Open this with its timeline, map and sketch side by side in the Time Place Causality Explorer">⧉ Open together ↗</button>'
      : ''
    R.openTogether = item => { const w = window.open(R.together(item.set.trim()), 'rcntogether'); if (w) try { w.focus() } catch (e) {} }
    return R
  })()
  // END rcn-lineup-follow

  // BEGIN rcn-record — pasted from tools/rcn-record.js by tools/paste-lineup-follow.js. Edit that file, never this block.
/* rcn-record.js — record a walk as a video file to share.
 *
 * ONE SOURCE. tools/paste-switch.js pastes this file into the Graph Tool, the
 * Map, the Timeline and the Time Place Causality Explorer (rcn-together.html),
 * between BEGIN/END marker lines. Edit this file, then run
 *   node tools/paste-switch.js
 *
 * WHAT THE READER DOES. In a tool's list of walks, each walk has a "● Video"
 * button. In the Explorer, the header has "● Record video". A small panel
 * explains what will happen; Start asks Chrome to share this tab (Chrome
 * shows its own "share this tab?" box — tick "Also share tab audio" so
 * recorded voices are in the video). Then:
 *
 *   - in a tool, the walk starts by itself;
 *   - in the Explorer, the reader clicks ▶ on a walk in any pane.
 *
 * Recording begins with the walk's first step, so the video opens on the walk,
 * not on the reader finding the button. It ends by itself a moment after the
 * last step has been read, or when the walk is closed (✕ or Esc), or when the
 * reader clicks Chrome's "Stop sharing". The video downloads as
 *   <walk name> — <date>.mp4      (.webm where Chrome can't write .mp4)
 *
 * WHAT IS IN THE PICTURE. The whole tab, minus the ⇄ bar and this file's own
 * panels, fitted onto a 1920 × 1080 frame (see hdFrame: one fixed size is
 * what lets Chrome write an MP4 that QuickTime opens). In the Explorer, only the three panes (Chrome's Region Capture
 * crops off the header). A pane popped out to its own window is not in the
 * Explorer's video.
 *
 * WHAT IS IN THE SOUND. The computer's own sound when "Record the computer's
 * sound" is ticked (the default): a second share, of the Entire Screen with
 * "Also share system audio", whose picture is thrown away. That is the only
 * way to catch the Mac's own computer voice, which macOS speaks outside the
 * tab (Marc's first walk video, Nov 18 2026, was silent for that reason).
 * Skipped, the tab's own sound is used: recorded and AI voices only. The
 * microphone box mixes in the reader's microphone. A meter on the mix warns,
 * when the video is saved, if the sound stayed silent.
 *
 * HOW IT KNOWS WHERE THE WALK IS. It listens for the walk messages of
 * tools/rcn-switch.js: { type:'rcn-walk' } for each step and for the end, and
 * { type:'rcn-walk-done' } when the last step has been read. They come from
 * this window (the 'rcn-walk-local' event), from frames (the Explorer's
 * panes), and over the BroadcastChannel 'rcn-follow' (other tabs).
 *
 * Needs Chrome or Edge (getDisplayMedia with preferCurrentTab). In a frame the
 * buttons don't show: the page around the frame records instead.
 *
 * Marc Pierson with Claude Opus 5.5, Nov 2026. MIT licence.
 */
;(function () {   // the leading ; keeps it safe after code written without semicolons
  if (window.RCNRecord) return;   // the wiki plugins each carry a copy; the first one serves the page
  var R = window.RCNRecord = {
    can: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder) && window.top === window,
    cropEl: null,      // function returning the element to crop the video to (the Explorer's panes), or null for the whole tab
    open: open,        // open(startFn, name): the panel; Start shares the tab, then calls startFn() (null = wait for a walk)
    stop: function () { stop(false); }
  };
  var cur = null;      // { state:'armed'|'rec', ds, mic, ctx, stream, rec, chunks, name, t0, tail }
  var TAIL = 2500;     // ms of picture kept after the last step has been read

  function css() {
    if (document.getElementById('rcn-rec-css')) return;
    var s = document.createElement('style'); s.id = 'rcn-rec-css';
    s.textContent =
      '#rcn-rec-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100001;width:min(440px,calc(100vw - 32px));' +
      'background:#fff;color:#1e293b;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.35);padding:18px 20px;font:14px/1.45 system-ui,sans-serif}' +
      '#rcn-rec-panel h3{margin:0 0 8px;font-size:16px}#rcn-rec-panel p{margin:0 0 10px}#rcn-rec-panel .small{font-size:12.5px;color:#475569}' +
      '#rcn-rec-panel label{display:flex;gap:8px;align-items:flex-start;margin:4px 0 12px;cursor:pointer}' +
      '#rcn-rec-panel .row{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}' +
      '#rcn-rec-panel button,#rcn-rec-wait button{font:inherit;border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 14px;cursor:pointer}' +
      '#rcn-rec-panel button.go{background:#b91c1c;border-color:#b91c1c;color:#fff;font-weight:600}' +
      '#rcn-rec-wait,#rcn-rec-toast{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:100001;background:#fff;color:#1e293b;' +
      'border-radius:10px;box-shadow:0 2px 14px rgba(0,0,0,.3);padding:8px 14px;font:13px system-ui,sans-serif;display:flex;gap:10px;align-items:center}' +
      '#rcn-rec-wait b{color:#b91c1c}' +
      'body.rcn-recording #rcn-switch,body.rcn-recording #rcn-rec-toast{display:none!important}';
    document.head.appendChild(s);
  }
  function el(id) { return document.getElementById(id); }
  function drop(id) { var e = el(id); if (e) e.remove(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg, ms) {
    css(); drop('rcn-rec-toast');
    var t = document.createElement('div'); t.id = 'rcn-rec-toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { if (t.parentNode) t.remove(); }, ms || 6000);
  }
  function pref(key, v, dflt) {
    try { if (v === undefined) { var x = localStorage.getItem(key); return x === null ? dflt : x === '1'; } localStorage.setItem(key, v ? '1' : '0'); } catch (e) {}
    return dflt;
  }
  function micPref(v) { return pref('rcnRecordMic', v, false); }
  function sysPref(v) { return pref('rcnRecordSystem', v, true); }

  // ── The panel ─────────────────────────────────────────────────────────
  function open(startFn, name) {
    if (!R.can) { toast('Recording a video needs Chrome or Edge, with the tool open in its own tab.'); return; }
    if (cur) { toast('Already recording — press Esc or close the walk to finish.'); return; }
    css(); drop('rcn-rec-panel');
    var p = document.createElement('div'); p.id = 'rcn-rec-panel';
    p.innerHTML =
      '<h3>● Record ' + (name ? '“' + esc(name) + '”' : 'a walk') + ' as a video</h3>' +
      '<p>Chrome will ask to share this tab: that is the picture.</p>' +
      (startFn ? '<p>The walk then starts by itself. ' : '<p>Then click ▶ on a walk in any pane; recording starts with its first step. ') +
      'Recording stops at the end of the walk, or when you close it or press Esc. The video goes to your Downloads folder.</p>' +
      '<label><input type="checkbox" id="rcn-rec-sys"' + (sysPref() ? ' checked' : '') + '> <span>Record the computer’s sound' +
      '<br><span class="small">Needed for the computer voice. Chrome asks a second time: choose <b>Entire Screen</b> and turn on <b>Also share system audio</b>. Only the sound is kept; the picture still comes from this tab.</span></span></label>' +
      '<label><input type="checkbox" id="rcn-rec-mic"' + (micPref() ? ' checked' : '') + '> <span>Also record my microphone' +
      '<br><span class="small">To talk over the walk.</span></span></label>' +
      '<div class="row"><button data-x>Cancel</button><button class="go" data-go>● Start recording</button></div>';
    document.body.appendChild(p);
    p.querySelector('[data-go]').focus();
    p.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-x]')) { p.remove(); return; }
      if (!ev.target.closest('[data-go]')) return;
      var mic = el('rcn-rec-mic').checked, sys = el('rcn-rec-sys').checked; micPref(mic); sysPref(sys); p.remove();
      arm(startFn, name, mic, sys);
    });
    p.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); p.remove(); } });
  }

  // ── Share the tab, then wait for the first step ───────────────────────
  // Sound, in order of preference:
  //   the computer's sound (system audio, from a second share of the Entire
  //     Screen: the only way to hear the Mac's own voice, which macOS speaks
  //     outside the tab; it already holds the tab's sound, so the tab's is
  //     then left out, or recorded voices would play twice);
  //   else the tab's sound (recorded and AI voices only);
  //   plus the microphone when ticked.
  // Each share needs its own click (Chrome's rule), hence the second button.
  function arm(startFn, name, mic, sys) {
    var ds, ss = null, ms = null;
    navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 }, audio: { suppressLocalAudioPlayback: false },
      preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', systemAudio: 'exclude'
    }).then(function (s) {
      ds = s;
      var vt = ds.getVideoTracks()[0], target = R.cropEl && R.cropEl();
      if (target && window.CropTarget && vt.cropTo)
        return CropTarget.fromElement(target).then(function (ct) { return vt.cropTo(ct); }).catch(function (e) { console.warn('rcn-record: crop', e); });
    }).then(function () {
      if (sys) return askSystem().then(function (s) { ss = s; });
    }).then(function () {
      if (mic) return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (m) { ms = m; })
        .catch(function () { toast('The microphone was refused; recording without it.'); });
    }).then(function () {
      var vt = ds.getVideoTracks()[0], frame = hdFrame(vt), tracks = [frame.track], ins = [], from = [];
      if (ss && ss.getAudioTracks().length) { ins.push(new MediaStream(ss.getAudioTracks())); from.push('computer'); }
      else if (ds.getAudioTracks().length) { ins.push(new MediaStream(ds.getAudioTracks())); from.push('tab'); }
      if (ms) { ins.push(ms); from.push('microphone'); }
      // Every source goes through one mixer, with a meter, so a silent video can be told apart.
      var ctx = new AudioContext(), dest = ctx.createMediaStreamDestination(), meter = ctx.createAnalyser();
      meter.fftSize = 2048; meter.connect(dest);
      ins.forEach(function (st) { ctx.createMediaStreamSource(st).connect(meter); });
      if (ins.length) tracks.push(dest.stream.getAudioTracks()[0]);
      cur = { state: 'armed', ds: ds, ss: ss, mic: ms, ctx: ctx, meter: meter, peak: 0, frame: frame, stream: new MediaStream(tracks),
              name: name || null, chunks: [], tail: null, from: from };
      if (sys && !(ss && ss.getAudioTracks().length))
        toast(ss ? 'No computer sound came through. Check that “Also share system audio” is on, and that macOS lets Chrome record system audio (System Settings › Privacy & Security › Screen & System Audio Recording; then quit and reopen Chrome). Recording ' + (from.length ? 'the ' + from.join(' and ') : 'no sound') + '.'
                 : 'Recording without the computer’s sound' + (from.length ? ' — the ' + from.join(' and ') + ' only.' : '.'), 9000);
      vt.addEventListener('ended', function () { stop(false); });   // Chrome's "Stop sharing"
      if (startFn) setTimeout(function () { try { startFn(); } catch (e) { console.warn(e); } }, 150);
      else waiting();
      // A walk that never comes: give the tab back after two minutes.
      setTimeout(function () { if (cur && cur.state === 'armed') { stop(true); toast('No walk started, so nothing was recorded.'); } }, 120000);
    }).catch(function (e) {
      [ds, ss, ms].forEach(function (st) { if (st) st.getTracks().forEach(function (t) { t.stop(); }); });
      drop('rcn-rec-panel'); cur = null;
      if (e && e.name === 'NotAllowedError') toast('Not recorded: sharing this tab was cancelled.');
      else { console.warn('rcn-record', e); toast('Could not start recording: ' + (e && e.message || e)); }
    });
  }
  // The second share, for the computer's sound. Resolves to the stream, or null
  // (skipped, cancelled, or this Chrome can't share system audio).
  function askSystem() {
    return new Promise(function (done) {
      css(); drop('rcn-rec-panel');
      var p = document.createElement('div'); p.id = 'rcn-rec-panel';
      p.innerHTML = '<h3>🔊 Now the computer’s sound</h3>' +
        '<p>In Chrome’s box, choose <b>Entire Screen</b> and turn on <b>Also share system audio</b>. Only the sound is used.</p>' +
        '<p class="small">The first time, macOS may ask to let Chrome record the screen and system audio (System Settings › Privacy &amp; Security). After allowing it, quit and reopen Chrome.</p>' +
        '<div class="row"><button data-x>Skip</button><button class="go" data-go>🔊 Share the computer’s sound</button></div>';
      document.body.appendChild(p);
      p.querySelector('[data-go]').focus();
      p.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-x]')) { p.remove(); done(null); return; }
        if (!ev.target.closest('[data-go]')) return;
        p.remove();
        navigator.mediaDevices.getDisplayMedia({
          video: true, audio: { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          systemAudio: 'include', selfBrowserSurface: 'exclude', monitorTypeSurfaces: 'include', surfaceSwitching: 'exclude'
        }).then(function (s) {
          s.getVideoTracks().forEach(function (t) { t.enabled = false; });   // the picture is the tab's; this share is for its sound
          done(s);
        }, function (e) { console.warn('rcn-record: system audio', e); done(null); });
      });
    });
  }
  function waiting() {
    css(); drop('rcn-rec-wait');
    var w = document.createElement('div'); w.id = 'rcn-rec-wait';
    w.innerHTML = '<span><b>●</b> Ready to record — start a walk</span><button>Cancel</button>';
    w.querySelector('button').onclick = function () { stop(true); };
    document.body.appendChild(w);
  }

  // ── One fixed picture size ────────────────────────────────────────────
  // The shared tab changes size during a walk (presentation view, full
  // screen, a resized window). Chrome's MP4 writer in the form QuickTime plays
  // (H.264 "avc1") stops when the size changes; the form that copes ("avc3")
  // QuickTime won't open (found Nov 18 2026 with Marc's first real video). So
  // the tab is drawn, fitted and centred, onto a 1920 × 1080 canvas, and the
  // canvas is what gets recorded: always HD, always the same size.
  var HD_W = 1920, HD_H = 1080;
  function hdFrame(vt) {
    var v = document.createElement('video'), cv = document.createElement('canvas'), on = true;
    v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([vt]);
    cv.width = HD_W; cv.height = HD_H;
    var g = cv.getContext('2d', { alpha: false });
    g.fillStyle = '#fff'; g.fillRect(0, 0, HD_W, HD_H);
    function draw() {
      if (!on) return;
      var w0 = v.videoWidth, h0 = v.videoHeight;
      if (w0 && h0) {
        var k = Math.min(HD_W / w0, HD_H / h0), w = Math.round(w0 * k), h = Math.round(h0 * k);
        g.fillStyle = '#fff'; g.fillRect(0, 0, HD_W, HD_H);
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(v, (HD_W - w) >> 1, (HD_H - h) >> 1, w, h);
      }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
    }
    v.play().then(draw, draw);
    return { track: cv.captureStream(30).getVideoTracks()[0],
             stop: function () { on = false; try { v.pause(); } catch (e) {} v.srcObject = null; } };
  }

  // ── Recording ─────────────────────────────────────────────────────────
  function mime() {
    // avc1 first: QuickTime, Keynote, phones and YouTube all take it.
    var list = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d0028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
                'video/mp4;codecs=avc3.640028,mp4a.40.2', 'video/mp4',
                'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return '';
  }
  function go() {
    drop('rcn-rec-wait'); drop('rcn-rec-toast');
    var type = mime(), rec;
    try { rec = new MediaRecorder(cur.stream, { mimeType: type, videoBitsPerSecond: 4000000, audioBitsPerSecond: 128000 }); }
    catch (e) { rec = new MediaRecorder(cur.stream); }
    cur.rec = rec; cur.state = 'rec'; cur.t0 = Date.now();
    var c = cur;
    rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) c.chunks.push(ev.data); };
    rec.onerror = function (ev) { console.warn('rcn-record: recorder', ev.error || ev); if (cur === c) stop(false); };
    rec.start(1000);
    c.meterTimer = setInterval(function () {   // loudest moment so far, to warn about a silent video
      if (!c.meter) return;
      var a = new Float32Array(c.meter.fftSize); c.meter.getFloatTimeDomainData(a);
      for (var i = 0; i < a.length; i++) { var v = Math.abs(a[i]); if (v > c.peak) c.peak = v; }
    }, 250);
    document.body.classList.add('rcn-recording');
  }
  function stop(discard) {
    if (!cur) return;
    var c = cur; cur = null;
    clearTimeout(c.tail); drop('rcn-rec-wait');
    document.body.classList.remove('rcn-recording');
    var release = function () {
      if (c.frame) c.frame.stop();
      c.stream.getTracks().forEach(function (t) { t.stop(); });
      clearInterval(c.meterTimer);
      c.ds.getTracks().forEach(function (t) { t.stop(); });
      if (c.ss) c.ss.getTracks().forEach(function (t) { t.stop(); });
      if (c.mic) c.mic.getTracks().forEach(function (t) { t.stop(); });
      if (c.ctx) try { c.ctx.close(); } catch (e) {}
    };
    if (!c.rec || c.state !== 'rec' || discard) { if (c.rec && c.rec.state !== 'inactive') c.rec.stop(); release(); return; }
    c.rec.onstop = function () { release(); save(c); };
    c.rec.stop();
  }
  function save(c) {
    var type = (c.rec.mimeType || 'video/webm').split(';')[0];
    var blob = new Blob(c.chunks, { type: type });
    var d = new Date(), day = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    var file = ((c.name || 'Walk') + ' — ' + day).replace(/[\\/:*?"<>|]+/g, '-') + (type === 'video/mp4' ? '.mp4' : '.webm');
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    var secs = Math.round((Date.now() - c.t0) / 1000), mb = (blob.size / 1048576).toFixed(1);
    toast('Saved “' + file + '” to Downloads — ' + Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2) + ', ' + mb + ' MB' +
          (!c.from.length ? '. No sound was shared, so the video is silent.'
            : c.peak < 0.003 ? '. ⚠ The sound was silent the whole time (from the ' + c.from.join(' and ') + ').'
            + (c.from[0] === 'tab' ? ' The computer voice is only heard with “Record the computer’s sound”.' : '') : ''), 12000);
  }

  // ── Hearing the walk ──────────────────────────────────────────────────
  var seen = {};
  function hear(m) {
    if (!cur || !m || (m.type !== 'rcn-walk' && m.type !== 'rcn-walk-done')) return;
    if (m.k) { if (seen[m.k]) return; seen[m.k] = 1; }
    var other = cur.lead && m.lead && m.lead !== cur.lead;   // a message about some other walk
    if (m.type === 'rcn-walk-done') {          // the last step has been read
      if (cur.state === 'rec' && !other) { clearTimeout(cur.tail); cur.tail = setTimeout(function () { stop(false); }, TAIL); }
      return;
    }
    if (m.end) { if (cur.state === 'rec' && !other) stop(false); return; }   // the walk was closed
    cur.lead = m.lead || cur.lead;             // the walk leading now is the one being recorded
    if (!cur.name && m.label) cur.name = String(m.label).split(' — step ')[0];
    if (cur.state === 'armed') go();
    else if (cur.tail) { clearTimeout(cur.tail); cur.tail = null; }  // went back a step after the end: keep going
  }
  window.addEventListener('rcn-walk-local', function (ev) { hear(ev.detail); });
  window.addEventListener('message', function (ev) { if (ev.origin === location.origin || ev.origin === 'null') hear(ev.data); });
  if ('BroadcastChannel' in window) try { new BroadcastChannel('rcn-follow').addEventListener('message', function (ev) { hear(ev.data); }); } catch (e) {}
  window.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && cur && cur.state === 'armed') stop(true); });
  window.addEventListener('pagehide', function () { if (cur) stop(false); });
})();
  // END rcn-record

  // Farm sites are alice.localhost, scp-experiment.localhost, … so match the suffix,
  // not the bare hostname. Local wikis get the working copy off the sofi-proxy static
  // server; everything else gets the deployed asset.
  const LOCAL = /(^|\.)localhost$/.test(window.location.hostname)
  const GRAPH_URL = LOCAL
    ? 'http://localhost:8765/tools/graph-tool-v22.html'
    : 'https://marc.relocalizecreativity.net/assets/Drag/graph-tool-v22.html'
  const WINDOW_NAME = 'rcngraph'

  // Track which item/element opened the current popup
  let pendingItem = null
  let pending$item = null

  // ── Build playback ─────────────────────────────────────────────────────
  // The Graph Tool's Build mode gives nodes a step number (n.build); an edge
  // shows once both its nodes do. The saved SVG keeps the tool's <g id="node-ID">
  // and <g id="edge-ID"> groups, so playing a build here is only hiding and
  // showing those groups — no redraw, no Graph Tool needed.
  const BUILD_COLOR = '#4f46e5'

  function graphModel(item) {
    let g = item.graphJSON
    if (typeof g === 'string') { try { g = JSON.parse(g) } catch (e) { return null } }
    return g && Array.isArray(g.nodes) && Array.isArray(g.edges) ? g : null
  }

  function buildSteps(g) {
    const s = new Set()
    g.nodes.forEach(n => { if (n.build > 0) s.add(n.build) })
    return [...s].sort((a, b) => a - b)
  }

  function groupFor(svg, kind, id) {
    return svg.querySelector('#' + CSS.escape(kind + '-' + id))
  }

  // idx === null: not playing, everything shows. 0: nothing of the build yet.
  function showBuildStep($item, g, idx) {
    const svg = $item.find('svg').get(0)
    if (!svg) return
    const steps = buildSteps(g)
    const thr = idx > 0 ? steps[idx - 1] : 0
    const hideOthers = g.buildOthers === 'hide'
    const byId = {}
    g.nodes.forEach(n => { byId[n.id] = n })
    const arrives = n => (n && n.build > 0 ? n.build : 0)
    const shown = n => {
      if (idx === null || !n) return true
      return n.build > 0 ? n.build <= thr : !hideOthers
    }
    svg.querySelectorAll('.rcn-build-ring').forEach(el => el.remove())
    g.nodes.forEach(n => {
      const el = groupFor(svg, 'node', n.id)
      if (!el) return
      el.style.display = shown(n) ? '' : 'none'
      if (idx > 0 && n.build === thr && n.w && n.h) {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
        r.setAttribute('class', 'rcn-build-ring')
        r.setAttribute('cx', '0'); r.setAttribute('cy', '0')
        r.setAttribute('rx', String(n.w / 2 + 9)); r.setAttribute('ry', String(n.h / 2 + 9))
        r.setAttribute('fill', 'none'); r.setAttribute('stroke', BUILD_COLOR)
        r.setAttribute('stroke-width', '3'); r.setAttribute('opacity', '.9')
        r.setAttribute('pointer-events', 'none')
        el.appendChild(r)
      }
    })
    g.edges.forEach(e => {
      const el = groupFor(svg, 'edge', e.id)
      if (!el) return
      const s = byId[e.src], t = byId[e.tgt]
      const on = shown(s) && shown(t)
      el.style.display = on ? '' : 'none'
      // The edge that arrived with this step: recolour its visible line, remember
      // the original so the next step can put it back.
      const isNew = on && idx > 0 && Math.max(arrives(s), arrives(t)) === thr
      el.querySelectorAll('path').forEach(p => {
        const st = p.getAttribute('stroke')
        if (!st || st === 'transparent' || st === 'none') return
        if (isNew) {
          if (!p.hasAttribute('data-build-stroke')) p.setAttribute('data-build-stroke', st)
          p.setAttribute('stroke', BUILD_COLOR)
        } else if (p.hasAttribute('data-build-stroke')) {
          p.setAttribute('stroke', p.getAttribute('data-build-stroke'))
          p.removeAttribute('data-build-stroke')
        }
      })
    })
    const bar = $item.find('.build-bar')
    bar.find('.build-count').text(idx === null ? '' : 'Step ' + idx + ' / ' + steps.length).toggle(idx !== null)
    bar.find('.build-play').text(idx === null ? '▶ Play build' : '■ Show all')
    bar.find('.build-prev, .build-next').toggle(idx !== null)
  }

  // ── Walk playback ──────────────────────────────────────────────────────
  // A walk, written in the Graph Tool, is a list of steps: words to say, and
  // what each step lights. The tool saves each step's lit node and edge ids, so
  // playing it here is setting the opacity of the saved SVG's groups and
  // speaking the words with the browser's own voice, shown as a caption too.
  const WALK_GHOST = 0.13, WALK_SEEN = 0.42
  let activeWalk = null   // one walk speaks at a time on the whole lineup

  function walkList(g) {
    return g && Array.isArray(g.walks) ? g.walks.filter(w => w && Array.isArray(w.steps) && w.steps.length) : []
  }

  // null = the whole drawing. Files saved before lit existed fall back to the
  // step's own nodes and the edges among them.
  function stepLit(g, st) {
    if (!st || st.all) return null
    if (st.lit) return { nodes: new Set(st.lit.nodes.map(String)), edges: new Set(st.lit.edges.map(String)) }
    const nodes = new Set((st.nodes || []).map(String))
    if (st.loop) String(st.loop).split(',').forEach(id => nodes.add(id))
    const edges = new Set(st.edges ? st.edges.map(String)
      : g.edges.filter(e => nodes.has(String(e.src)) && nodes.has(String(e.tgt))).map(e => String(e.id)))
    return { nodes, edges }
  }

  // Zoom the saved SVG towards what a step lights, so a narrow wiki column can
  // still read it. Never closer than 2.5×, and the faded rest stays around it.
  // els === null: back to the whole drawing.
  function walkZoom(svg, els) {
    if (!svg.__fullViewBox) svg.__fullViewBox = svg.getAttribute('viewBox') || ('0 0 ' + (svg.getAttribute('width') || 1000) + ' ' + (svg.getAttribute('height') || 600))
    const full = svg.__fullViewBox.split(/[\s,]+/).map(Number)
    let to = full
    if (els && els.length) {
      const inv = svg.getScreenCTM() && svg.getScreenCTM().inverse()
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      els.forEach(el => {
        const r = el.getBoundingClientRect()
        if (!inv || !r.width) return
        ;[[r.left, r.top], [r.right, r.bottom]].forEach(([x, y]) => {
          const pt = svg.createSVGPoint(); pt.x = x; pt.y = y
          const q = pt.matrixTransform(inv)
          x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y)
        })
      })
      if (isFinite(x0)) {
        const pad = 40, aspect = full[3] / full[2]
        let w = Math.max(x1 - x0 + 2 * pad, full[2] / 2.5), h = Math.max(y1 - y0 + 2 * pad, full[3] / 2.5)
        if (h / w > aspect) w = h / aspect; else h = w * aspect
        w = Math.min(w, full[2]); h = Math.min(h, full[3])
        let x = (x0 + x1) / 2 - w / 2, y = (y0 + y1) / 2 - h / 2
        x = Math.max(full[0], Math.min(full[0] + full[2] - w, x)); y = Math.max(full[1], Math.min(full[1] + full[3] - h, y))
        to = [x, y, w, h]
      }
    }
    const from = (svg.getAttribute('viewBox') || svg.__fullViewBox).split(/[\s,]+/).map(Number)
    const t0 = performance.now(), dur = 600, id = (svg.__zoomId = (svg.__zoomId || 0) + 1)
    const tick = now => {
      if (svg.__zoomId !== id) return
      const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      svg.setAttribute('viewBox', from.map((v, j) => v + (to[j] - v) * e).join(' '))
      if (k < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  // i === null: no walk, everything back to normal.
  // Whole (the Whole / Step switch, rcn-lineup-follow): steps light boxes where they
  // are; the view is the whole drawing or wherever you have dragged and zoomed it.
  const isWhole = $item => !!(RL && RL.whole && RL.whole($item.get(0)))
  function showWalkStep($item, g, walk, i) {
    const svg = $item.find('svg').get(0)
    if (!svg) return
    const hold = isWhole($item)
    svg.querySelectorAll('.rcn-walk-ring').forEach(el => el.remove())
    $item.find('.graph-box').css('max-height', i === null ? '280px' : 'none')
    if (i === null) {
      g.nodes.forEach(n => { const el = groupFor(svg, 'node', n.id); if (el) el.style.opacity = '' })
      g.edges.forEach(e => { const el = groupFor(svg, 'edge', e.id); if (el) el.style.opacity = '' })
      if (!hold) walkZoom(svg, null)
      return
    }
    const seen = { nodes: new Set(), edges: new Set() }
    walk.steps.slice(0, i).forEach(st => {
      const L = stepLit(g, st)
      if (L) { L.nodes.forEach(id => seen.nodes.add(id)); L.edges.forEach(id => seen.edges.add(id)) }
    })
    const lit = stepLit(g, walk.steps[i])
    const op = (kind, id) => !lit || lit[kind].has(id) ? '1' : seen[kind].has(id) ? String(WALK_SEEN) : String(WALK_GHOST)
    g.nodes.forEach(n => {
      const el = groupFor(svg, 'node', n.id)
      if (!el) return
      el.style.opacity = op('nodes', String(n.id))
    })
    g.edges.forEach(e => {
      const el = groupFor(svg, 'edge', e.id)
      if (el) el.style.opacity = op('edges', String(e.id))
    })
    if (!hold) walkZoom(svg, lit ? [...lit.nodes].map(id => groupFor(svg, 'node', id)).filter(Boolean) : null)
  }

  // Voice and speed are the listener's: kept in this browser, the same keys the Graph Tool uses.
  function walkPrefs() {
    let p = {}
    try { p = JSON.parse(localStorage.getItem('rcnWalkPrefs') || '{}') } catch (e) {}
    let on = true
    try { on = localStorage.getItem('rcnWalkVoice') !== 'off' } catch (e) {}
    return { voice: p.voice || '', rate: (+p.rate >= 0.6 && +p.rate <= 1.4) ? +p.rate : 0.95, on }
  }
  function walkSetPref(k, v) {
    let p = {}
    try { p = JSON.parse(localStorage.getItem('rcnWalkPrefs') || '{}') } catch (e) {}
    p[k] = v
    try { localStorage.setItem('rcnWalkPrefs', JSON.stringify(p)) } catch (e) {}
  }
  // The ⚙ Voice panel (Nov 8 2026): the Graph Tool's voice and speed controls, the
  // same rcnWalkPrefs keys, so a choice made here holds in the tools and other plugins.
  const goodVoice = v => /Enhanced|Premium|Natural|Neural/i.test(v.name)
  const enVoices = () => window.speechSynthesis ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : []
  function voiceOptions() {
    const vs = enVoices()
    if (!vs.length) return '<option value="">No voices found in this browser</option>'
    const cur = walkVoice(walkPrefs().voice)
    return vs.slice().sort((a, b) => (goodVoice(b) - goodVoice(a)) || a.name.localeCompare(b.name))
      .map(v => `<option value="${esc(v.name)}"${cur && cur.name === v.name ? ' selected' : ''}>${goodVoice(v) ? '★ ' : ''}${esc(v.name)} (${esc(v.lang)})</option>`).join('')
  }
  function voiceHint() {
    const mac = /Mac/i.test(navigator.platform || navigator.userAgent)
    return enVoices().some(goodVoice) ? '★ marks the more natural voices. Speed is for the computer voice; a recording plays as it was recorded.'
      : mac ? 'No natural-sounding voice is installed. On a Mac: System Settings → Accessibility → Spoken Content → System voice → Manage Voices… Download an English voice marked Enhanced or Premium, then quit the browser (⌘Q) and open it again: reloading the page is not enough.'
        : 'No natural-sounding voice is installed. Your system’s speech settings can add more voices; reload this page after.'
  }
  function voiceSample() {
    if (!window.speechSynthesis) return
    const p = walkPrefs(), v = walkVoice(p.voice), u = new SpeechSynthesisUtterance('This is how a walk will sound.')
    if (v) { u.voice = v; u.lang = v.lang }
    u.rate = p.rate
    speechSynthesis.speak(u)
  }
  function walkVoice(name) {
    const vs = window.speechSynthesis ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : []
    return vs.find(v => v.name === name) || vs.find(v => /Enhanced|Premium|Natural|Neural/i.test(v.name)) ||
      ['Samantha', 'Daniel', 'Karen', 'Moira', 'Google UK English Female', 'Google US English', 'Microsoft Aria']
        .map(p => vs.find(v => v.name.indexOf(p) === 0)).find(Boolean) || vs[0] || null
  }
  // Say the words; done() runs once when they have been said. One utterance per
  // sentence, because Chrome stops a long one after about fifteen seconds.
  function walkSay(text, isCurrent, done) {
    const prefs = walkPrefs(), words = (text || '').split(/\s+/).length
    let fired = false
    const after = () => { if (fired || !isCurrent()) return; fired = true; done() }
    setTimeout(after, words * (prefs.on ? 650 : 420) + (prefs.on ? 6000 : 2500))  // if the voice never says it finished
    if (!prefs.on || !window.speechSynthesis || !text) { setTimeout(after, text ? words * 400 + 2000 : 1200); return }
    const v = walkVoice(prefs.voice)
    const parts = text.match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g) || [text]
    parts.forEach((s, k) => {
      const u = new SpeechSynthesisUtterance(s.trim())
      if (v) { u.voice = v; u.lang = v.lang }
      u.rate = prefs.rate
      if (k === parts.length - 1) u.onend = after
      speechSynthesis.speak(u)
    })
  }

  // People's own recordings of a step, made in the Graph Tool, Map or Timeline walk
  // editor: step.voices = {name: {audio, say}}. A step plays its recording when it has
  // one, else the computer voice. The listener picks whose, kept in this browser with
  // the other walk settings (rcnWalkPrefs.speaker: '' any, '-' computer only, or a name).
  let recAudio = null
  const recOk = src => typeof src === 'string' && /^(data:audio\/|https?:\/\/|\/)/.test(src)
  const recNames = st => st && st.voices ? Object.keys(st.voices).filter(n => st.voices[n] && recOk(st.voices[n].audio)) : []
  const recSpeakers = walk => [...new Set(((walk && walk.steps) || []).flatMap(recNames))].sort()
  function recSpeaker() {
    try { return JSON.parse(localStorage.getItem('rcnWalkPrefs') || '{}').speaker || '' } catch (e) { return '' }
  }
  function recSetSpeaker(v) {
    let p = {}
    try { p = JSON.parse(localStorage.getItem('rcnWalkPrefs') || '{}') } catch (e) {}
    p.speaker = v
    try { localStorage.setItem('rcnWalkPrefs', JSON.stringify(p)) } catch (e) {}
  }
  function recSpeakerOptions(walk) {
    const ns = recSpeakers(walk), cur = recSpeaker()
    if (!ns.length) return ''
    const opt = (v, label) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(label)}</option>`
    return opt('', 'Recorded voices') + ns.map(n => opt(n, 'Recorded: ' + n)).join('') + opt('-', 'Computer voice only')
  }
  function recHush() {
    const a = recAudio
    recAudio = null
    if (a) { a.onended = a.onerror = null; try { a.pause() } catch (e) {} }
  }
  // Say a step: a person's recording when it has one, else the computer voice.
  function walkSayStep(st, isCurrent, done) {
    const ns = recNames(st), want = recSpeaker()
    if (!walkPrefs().on || want === '-' || !ns.length) { walkSay(st.say, isCurrent, done); return }
    try { if (window.speechSynthesis) speechSynthesis.cancel() } catch (e) {}
    recHush()
    const a = new Audio(st.voices[ns.includes(want) ? want : ns[0]].audio)
    recAudio = a
    let out = false
    const fin = ok => {
      if (out || recAudio !== a) return
      out = true; recAudio = null
      if (!isCurrent()) return
      if (ok) done(); else walkSay(st.say, isCurrent, done)
    }
    a.onended = () => fin(true)
    a.onerror = () => fin(false)
    const p = a.play()
    if (p && p.catch) p.catch(() => fin(false))
  }

  function walkBar(item) {
    const g = graphModel(item)
    const ws = walkList(g)
    if (!ws.length) return ''
    const b = 'cursor:pointer;color:' + BUILD_COLOR + ';'
    const pick = ws.length > 1
      ? `<select class="walk-pick" style="max-width:220px;font-size:12px" title="Which walk">${ws.map((w, i) => `<option value="${i}">${esc(w.name || 'Walk ' + (i + 1))} (${w.steps.length} steps)</option>`).join('')}</select>`
      : `<span style="font-size:12px;color:#475569">${esc(ws[0].name || 'Walk')}</span>`
    return `
          <div class="walk-bar" tabindex="0" title="Hear and see this drawing explained one part at a time. Space plays or pauses, ← → step, Esc stops." style="padding:8px 0 0;outline:none;">
            <div style="display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap">
              <button class="walk-start" style="${b}font-weight:600">▶ Walk</button>
              ${pick}
              ${window.RCNRecord && window.RCNRecord.can ? `<button class="walk-video" style="${b}" title="Record this walk as a video file to share">● Video</button>` : ''}
              <button class="walk-prev" style="${b}display:none" title="Back a step (←)">◀</button>
              <button class="walk-play" style="${b}display:none" title="Play or pause (Space)">❚❚</button>
              <button class="walk-next" style="${b}display:none" title="Next step (→)">▶</button>
              <span class="walk-count" style="display:none;font-size:12px;color:#64748b;min-width:70px;text-align:center"></span>
              <button class="walk-voice" style="${b}display:none" title="Read the words aloud, or show them only"></button>
          <select class="walk-speaker" style="font-size:12px;max-width:170px;display:none" title="Whose voice reads the walk (kept in this browser)"></select>
              <button class="walk-voiceset" style="${b}" title="Choose which voice reads the walk, and how fast">⚙ Choose voice</button>
              <button class="walk-close" style="${b}display:none" title="Stop the walk (Esc)">■ Stop</button>
            </div>
            <div class="walk-voicepanel" style="display:none;margin:6px 4px 0;padding:8px 10px;background:#eef2ff;border-radius:8px;font-size:12px;color:#374151">
              <div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:center">
                <label>Voice <select class="walk-voicesel" style="font-size:12px;max-width:260px" title="Which computer voice reads the walk (kept in this browser)"></select></label>
                <label>Speed <input class="walk-rate" type="range" min="0.6" max="1.4" step="0.05" style="vertical-align:middle"> <span class="walk-rate-val"></span></label>
                <button class="walk-sample" style="${b}" title="Hear the chosen voice at the chosen speed">Hear a sample</button>
              </div>
              <div class="walk-voicehint" style="font-size:11px;color:#6b7280;text-align:center;margin-top:4px"></div>
            </div>
            <div class="walk-say" aria-live="polite" style="display:none;margin:8px 4px 0;padding:10px 12px;background:#fff;border:1px solid #c7d2fe;border-radius:8px;font-size:17px;line-height:1.45;color:#1e1b4b"></div>
            <div class="walk-note" style="font-size:11px;color:#64748b;text-align:center;margin-top:3px"></div>
          </div>`
  }

  // Following another item in the lineup (see rcn-lineup-follow): the boxes it
  // lights here at full strength, an arrow between two of them too, what it lit
  // before at half, the rest faded; the drawing zooms towards the lit boxes.
  function showFollow($item, g, f) {
    const svg = $item.find('svg').get(0)
    if (!svg) return
    svg.querySelectorAll('.rcn-walk-ring').forEach(el => el.remove())
    $item.find('.graph-box').css('max-height', 'none')
    const op = id => RL.op(f, String(id))
    g.nodes.forEach(n => { const el = groupFor(svg, 'node', n.id); if (el) el.style.opacity = String(op(n.id)) })
    g.edges.forEach(e => { const el = groupFor(svg, 'edge', e.id); if (el) el.style.opacity = String(Math.min(op(e.src), op(e.tgt))) })
    if (!isWhole($item) || f.click) walkZoom(svg, [...f.lit].map(id => groupFor(svg, 'node', id)).filter(Boolean))   // a click brings it into view even on Whole
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }

  function renderContent($item, item) {
    $item.empty()
    if (item.svgString) {
      $item.append(`
        <div style="background:#f5f5f5;padding:8px;">
          <div class="graph-box" style="overflow:auto;max-height:280px;border:1px solid #ddd;background:#fff;">
            ${item.svgString}
          </div>
          <div style="padding:6px 0 0;display:flex;gap:6px;justify-content:center;">
            <button class="edit-graph" style="cursor:pointer;">Edit in Graph Tool ↗</button>
            ${RL ? RL.togetherButton(item) : ''}
            ${RL && RL.frameSwitch ? RL.frameSwitch('sketch') : ''}
            ${RL && RL.hoverSwitch ? RL.hoverSwitch() : ''}
          </div>
          ${buildBar(item)}
          ${walkBar(item)}
        </div>
      `)
    } else {
      $item.append(`
        <div style="background-color:#eee;padding:15px;text-align:center;">
          <p style="font-weight:bold;margin:0 0 6px;">RCN Graph Tool</p>
          <p style="color:#666;font-size:0.85em;margin:0 0 12px;">CLD · EIP · NRM · Trace · Wardley · OPM · SFD · LOP · VSM · IBIS</p>
          <button class="open-graph" style="cursor:pointer;">Open Graph Tool ↗</button>
        </div>
      `)
    }
  }

  function buildBar(item) {
    const g = graphModel(item)
    const n = g ? buildSteps(g).length : 0
    if (!n) return ''
    const b = 'cursor:pointer;color:' + BUILD_COLOR + ';'
    return `
          <div class="build-bar" tabindex="0" title="This diagram has a build: it can be revealed node by node. ← → step through it." style="padding:6px 0 0;display:flex;gap:6px;justify-content:center;align-items:center;outline:none;">
            <button class="build-prev" style="${b}display:none" title="Back one step (←)">◀</button>
            <button class="build-play" style="${b}">▶ Play build</button>
            <button class="build-next" style="${b}display:none" title="Next step (→)">▶</button>
            <span class="build-count" style="display:none;font-size:12px;color:#64748b;min-width:70px;text-align:center"></span>
          </div>`
  }

  function emit($item, item) {
    renderContent($item, item)
  }


  // ⓘ — this plugin's About page in one click. FedWiki opens it with Cmd/Ctrl-I,
  // but only from the item's text editor, which people seldom open when the real
  // work happens elsewhere. Redraws empty the item, so the mark puts itself back.
  function aboutMark ($item, type) {
    const el = $item.get(0)
    if (!el || el.__aboutMark) return
    el.__aboutMark = true
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
    const add = () => {
      if (el.querySelector(':scope > .rcn-about')) return
      const a = document.createElement('a')
      a.className = 'rcn-about'
      a.href = '/view/about-' + type + '-plugin'
      a.title = 'About this plugin'
      a.textContent = 'ⓘ'
      a.style.cssText = 'position:absolute;top:0;right:-18px;z-index:1000;font:15px/1 system-ui,sans-serif;color:#64748b;text-decoration:none;cursor:pointer;background:rgba(255,255,255,.75);border-radius:50%;padding:1px 2px'
      a.addEventListener('click', e => {
        e.preventDefault()
        e.stopPropagation()
        wiki.doInternalLink('about ' + type + ' plugin', $item.parents('.page:first'))
      })
      a.addEventListener('dblclick', e => e.stopPropagation())
      el.appendChild(a)
    }
    add()
    new MutationObserver(add).observe(el, { childList: true })
  }

  // ── Notes you can edit from their popup (Nov 8 2026) ──────────────────────
  // The drawing's hover text is the browser's own <title> tooltip, which cannot hold a
  // button. So the plugin shows its own popup instead (the <title> text moves to
  // data-note while the page is open, and stays in the saved picture), with
  // "✎ Edit note". Saving writes the note into graphJSON — the same field the Graph
  // Tool's side panel edits — and into that box's hover text in svgString, then saves
  // the page. A box's label and the picture itself are not touched.
  const NOTE_DOT = '#f59e0b'
  function graphOf(item) {
    const asText = typeof item.graphJSON === 'string'
    let g = item.graphJSON
    if (asText) { try { g = JSON.parse(g) } catch (e) { g = null } }
    return { g, asText }
  }
  // "📌 note" leads the hover text when there is a note; properties follow it.
  function retitle(title, oldNote, newNote) {
    const t = String(title || '')
    const pin = '\uD83D\uDCCC '
    const rest = oldNote && t.indexOf(pin + oldNote) === 0 ? t.slice((pin + oldNote).length).replace(/^\n/, '')
      : t.indexOf(pin) === 0 ? t.replace(/^[^\n]*\n?/, '') : t
    return (newNote ? pin + newNote + (rest ? '\n' : '') : '') + rest
  }
  function svgWithNote(svgString, kind, id, oldNote, newNote) {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml')
    if (doc.getElementsByTagName('parsererror').length) return null
    const g = doc.getElementById(kind + '-' + id)
    if (!g) return null
    const NS = 'http://www.w3.org/2000/svg'
    let t = Array.from(g.children).find(c => c.localName === 'title')
    const text = retitle(t ? t.textContent : '', oldNote, newNote)
    if (text) {
      if (!t) { t = doc.createElementNS(NS, 'title'); g.insertBefore(t, g.firstChild) }
      t.textContent = text
    } else if (t) t.remove()
    if (kind === 'node') {
      const dot = Array.from(g.children).find(c => c.localName === 'circle' && c.getAttribute('fill') === NOTE_DOT && c.getAttribute('r') === '4')
      const rect = Array.from(g.children).find(c => c.localName === 'rect')
      if (newNote && !dot && rect) {
        const c = doc.createElementNS(NS, 'circle')
        c.setAttribute('cx', (+rect.getAttribute('x') + +rect.getAttribute('width') - 4).toFixed(1))
        c.setAttribute('cy', (+rect.getAttribute('y') + 4).toFixed(1))
        c.setAttribute('r', '4'); c.setAttribute('fill', NOTE_DOT); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '1')
        rect.after(c)
      } else if (!newNote && dot) dot.remove()
    }
    return new XMLSerializer().serializeToString(doc.documentElement)
  }
  function bindNotes($item, item) {
    const box = $item.find('.graph-box').get(0)
    if (!box || !graphOf(item).g) return
    let card = null, hideT = 0, editing = false
    const groups = box.querySelectorAll('g[id^="node-"], g[id^="edge-"]')
    // Move each <title> into data-note so the browser's own tooltip does not double ours.
    groups.forEach(gEl => {
      const t = Array.from(gEl.children).find(c => c.localName === 'title')
      if (t) { gEl.setAttribute('data-note', t.textContent); t.remove() }
    })
    const close = () => { editing = false; if (card) { card.remove(); card = null } }
    const place = (ev) => {
      if (!card || editing) return
      const w = card.offsetWidth || 300, h = card.offsetHeight || 0
      let x = ev.clientX + 14, y = ev.clientY - 10
      if (x + w > window.innerWidth - 8) x = Math.max(8, ev.clientX - w - 14)
      if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8)
      card.style.left = x + 'px'; card.style.top = y + 'px'
    }
    const show = (gEl, ev) => {
      if (editing) return
      clearTimeout(hideT)
      if (RL && RL.hoverOff && RL.hoverOff()) { close(); return }   // the lineup's Hover text switch (rcn-lineup-follow)
      const kind = gEl.id.startsWith('node-') ? 'node' : 'edge', id = gEl.id.slice(kind.length + 1)
      const { g } = graphOf(item)
      const obj = g && (kind === 'node' ? g.nodes : g.edges).find(o => String(o.id) === id)
      const text = gEl.getAttribute('data-note') || ''
      if (!obj || !text) { close(); return }   // like the Graph Tool: a popup only where there is hover text
      if (!card) {
        card = document.createElement('div')
        card.className = 'rcng-note-card'
        card.style.cssText = 'position:fixed;z-index:3000;max-width:320px;background:rgba(255,255,255,.96);border:1px solid rgba(0,0,0,.1);border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.18);padding:8px 12px;font:12px/1.55 system-ui,sans-serif;color:#0f172a;white-space:pre-wrap;word-break:break-word'
        card.addEventListener('mouseenter', () => clearTimeout(hideT))
        card.addEventListener('mouseleave', () => { if (!editing) hideT = setTimeout(close, 120) })
        document.body.appendChild(card)
      }
      card.innerHTML = `<div>${esc(text)}</div>` +
        `<div style="margin-top:6px;white-space:normal"><button class="rcng-note-edit" style="font:inherit;font-size:11px;padding:2px 8px;border:1px solid #c7d2fe;border-radius:5px;background:#fff;color:#3730a3;cursor:pointer" title="Change this note. It is saved into the drawing on this page.">✎ Edit note</button></div>`
      card.querySelector('.rcng-note-edit').onclick = () => edit(gEl, kind, id, obj)
      place(ev)
    }
    const edit = (gEl, kind, id, obj) => {
      editing = true
      const label = String(obj.label || '').replace(/\n/g, ' ')
      card.style.width = '360px'; card.style.maxWidth = 'calc(100vw - 16px)'; card.style.whiteSpace = 'normal'
      card.innerHTML = `<div style="font-weight:600;margin-bottom:4px">Note on “${esc(label || '(no label)')}”</div>
        <textarea rows="6" style="width:100%;box-sizing:border-box;font:13px/1.4 system-ui,sans-serif;padding:5px 7px;border:1px solid #c7d2fe;border-radius:5px;resize:vertical" placeholder="What a reader should know about this: a quote, a source, a reason."></textarea>
        <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
          <button class="rcng-note-save" style="font:inherit;font-size:11px;padding:2px 10px;border:1px solid #4f46e5;border-radius:5px;background:#4f46e5;color:#fff;font-weight:600;cursor:pointer">Save</button>
          <button class="rcng-note-cancel" style="font:inherit;font-size:11px;padding:2px 8px;border:1px solid #c7d2fe;border-radius:5px;background:#fff;color:#3730a3;cursor:pointer">Cancel</button>
          <span style="font-size:10px;color:#64748b;margin-left:auto">⌘/Ctrl-Enter saves · Esc cancels</span></div>`
      const r = card.getBoundingClientRect()
      if (r.right > window.innerWidth - 8) card.style.left = Math.max(8, window.innerWidth - r.width - 8) + 'px'
      if (r.bottom > window.innerHeight - 8) card.style.top = Math.max(8, window.innerHeight - r.height - 8) + 'px'
      const ta = card.querySelector('textarea')
      ta.value = obj.note || ''
      const save = () => {
        const v = ta.value.replace(/\s+$/, '')
        const old = obj.note || ''
        close()
        if (v === old) return
        const { g, asText } = graphOf(item)
        const o = g && (kind === 'node' ? g.nodes : g.edges).find(x => String(x.id) === id)
        if (!o) return
        o.note = v
        const svg = item.svgString ? svgWithNote(item.svgString, kind, id, old, v) : null
        item.graphJSON = asText ? JSON.stringify(g) : g
        if (svg) item.svgString = svg
        wiki.pageHandler.put($item.parents('.page:first'), { type: 'edit', id: item.id, item })
        renderContent($item, item)
        bind($item, item)
      }
      card.querySelector('.rcng-note-save').onclick = save
      card.querySelector('.rcng-note-cancel').onclick = close
      ta.addEventListener('keydown', e => {
        e.stopPropagation()
        if (e.key === 'Escape') { e.preventDefault(); close() }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() }
      })
      ta.addEventListener('dblclick', e => e.stopPropagation())
      ta.focus()
    }
    if (RL && RL.onHover) RL.onHover($item.get(0), on => { if (!on && !editing) close() })
    groups.forEach(gEl => {
      gEl.addEventListener('mouseenter', ev => show(gEl, ev))
      gEl.addEventListener('mousemove', ev => place(ev))
      gEl.addEventListener('mouseleave', () => { if (!editing) { clearTimeout(hideT); hideT = setTimeout(close, 150) } })
    })
  }

  function bind($item, item) {
    aboutMark($item, 'rcngraph')
    bindNotes($item, item)
    $item.on('click', '.rcn-together', e => { e.stopPropagation(); RL.openTogether(item) })
    $item.on('click', '.open-graph, .edit-graph', () => {
      pendingItem = item
      pending$item = $item
      const popup = window.open(GRAPH_URL, WINDOW_NAME, 'popup,height=820,width=1440')
      if (popup) popup.focus()
    })
    $item.on('dblclick', e => {
      // Stepping a build or a walk is quick clicking — never let it open the editor.
      if ($(e.target).closest('.build-bar, .walk-bar, .rcn-frame').length) return
      wiki.textEditor($item, item)
    })
    // Build playback. Namespaced and reset, because a save re-runs bind.
    let buildIdx = null
    const step = d => {
      const g = graphModel(item)
      if (!g) return
      const n = buildSteps(g).length
      buildIdx = buildIdx === null ? (d < 0 ? n : 1) : Math.max(0, Math.min(n, buildIdx + d))
      showBuildStep($item, g, buildIdx)
    }
    $item.off('.rcnbuild')
    $item.on('click.rcnbuild', '.build-play', () => {
      const g = graphModel(item)
      if (!g) return
      if (wk.w !== null) walkEnd()
      buildIdx = buildIdx === null ? 1 : null
      showBuildStep($item, g, buildIdx)
      $item.find('.build-bar').trigger('focus')
    })
    $item.on('click.rcnbuild', '.build-prev', () => step(-1))
    $item.on('click.rcnbuild', '.build-next', () => step(1))
    $item.on('keydown.rcnbuild', '.build-bar', e => {
      if (buildIdx === null) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); step(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); step(-1) }
      else if (e.key === 'Escape') { e.preventDefault(); buildIdx = null; showBuildStep($item, graphModel(item), null) }
    })
    // Walk playback. w === null: no walk open. token guards every voice callback,
    // so a step that was skipped or stopped can never move the walk on.
    const wk = { w: null, i: 0, playing: false, token: 0, heard: null }
    const elG = $item.get(0)
    const curWalk = () => { const g = graphModel(item); return g && wk.w !== null ? walkList(g)[wk.w] : null }
    const stopVoice = () => { wk.token++; recHush(); try { if (window.speechSynthesis) speechSynthesis.cancel() } catch (e) {} }
    const walkUI = note => {
      const walk = curWalk(), open = !!walk
      if (note) wk.heard = wk.i; else if (wk.playing) wk.heard = null
      const $bar = $item.find('.walk-bar')
      $bar.find('.walk-prev, .walk-next, .walk-play, .walk-count, .walk-voice, .walk-close').toggle(open)
      $bar.find('.walk-voicepanel').toggle(!!wk.vp)   // before a walk starts too: choose first, then listen
      $bar.find('.walk-voiceset').css('background', wk.vp ? '#eef2ff' : '')
      $bar.find('.walk-start, .walk-pick, .walk-video').toggle(!open)
      $bar.find('.walk-say').toggle(open)
      $bar.find('.walk-play').text(wk.playing ? '❚❚' : '▶')
      $bar.find('.walk-voice').text(walkPrefs().on ? '🔈 Voice on' : '🔇 Voice off')
      const so = open ? recSpeakerOptions(walk) : '', $sp = $bar.find('.walk-speaker')
      if ($sp.data('opts') !== so) $sp.html(so).data('opts', so)
      $sp.toggle(!!so)
      $bar.find('.walk-count').text(open ? 'Step ' + (wk.i + 1) + ' of ' + walk.steps.length : '')
      $bar.find('.walk-note').text(note || (open && !wk.playing ? 'Space plays · ← → step · Esc stops' : ''))
    }
    const walkShow = i => {
      const g = graphModel(item), walk = curWalk()
      if (!walk) return
      wk.i = Math.max(0, Math.min(walk.steps.length - 1, i))
      stopVoice()
      elG.rcnFollow = null   // leading now, not following
      showWalkStep($item, g, walk, wk.i)
      const st = walk.steps[wk.i]
      if (RL) { const lit = stepLit(g, st); RL.step(elG, 'sketch', { eips: lit ? [...lit.nodes] : [], all: !lit, label: walk.name }) }
      $item.find('.walk-say').text(st.say || '').css({ color: st.ask ? '#7c2d12' : '#1e1b4b', fontStyle: st.ask ? 'italic' : 'normal' })
      walkUI()
      if (wk.playing) walkSpeak()
    }
    const walkSpeak = () => {
      const tok = ++wk.token, walk = curWalk(), st = walk && walk.steps[wk.i]
      if (!st) return
      walkSayStep(st, () => tok === wk.token && activeWalk === wk, () => {
        const last = wk.i >= walk.steps.length - 1
        if (last && RL && RL.done) RL.done(elG, 'sketch')
        if (st.ask || last) { wk.playing = false; walkUI(last && !st.ask ? 'End of the walk. ← to go back, Esc to stop.' : 'Over to you. Press Space or ▶ to go on.'); return }
        setTimeout(() => { if (tok === wk.token && wk.playing) walkShow(wk.i + 1) }, 800)
      })
    }
    const walkPause = () => { wk.playing = false; stopVoice(); walkUI() }
    const walkToggle = () => {
      if (wk.w === null) return
      if (wk.playing) { walkPause(); return }
      if (activeWalk && activeWalk !== wk && activeWalk.end) activeWalk.end()
      activeWalk = wk
      wk.playing = true
      // Play after a step already heard (an ask step, say) goes on to the next.
      if (wk.heard === wk.i && wk.i < curWalk().steps.length - 1) { walkShow(wk.i + 1); return }
      walkUI(); walkSpeak()
    }
    const walkEnd = () => {
      if (wk.w === null) return
      wk.playing = false; stopVoice()
      const g = graphModel(item)
      if (g) showWalkStep($item, g, null, null)
      wk.w = null
      if (activeWalk === wk) activeWalk = null
      if (RL) RL.end(elG, 'sketch')
      walkUI()
    }
    wk.end = walkEnd
    // Whole / Step (rcn-lineup-follow). Whole and ⤢ show the whole drawing; Step
    // frames what is lit now. In Whole the drawing is yours to pan and zoom.
    if (RL && RL.bindFrame && $item.find('.graph-box svg').length) {
      const svgNow = () => $item.find('.graph-box svg').get(0)
      RL.bindFrame(elG, 'sketch', (fr, fit) => {
        const g = graphModel(item), svg = svgNow()
        if (!g || !svg) return
        if (fr === 'whole' || fit) { walkZoom(svg, null); return }
        if (wk.w !== null) showWalkStep($item, g, curWalk(), wk.i)
        else if (elG.rcnFollow && elG.rcnFollow.lit) showFollow($item, g, elG.rcnFollow)
      })
      const vb = svg => (svg.getAttribute('viewBox') || svg.__fullViewBox || '0 0 1000 600').split(/[\s,]+/).map(Number)
      const put = (svg, v) => { svg.__zoomId = (svg.__zoomId || 0) + 1; svg.setAttribute('viewBox', v.join(' ')) }   // also stops a zoom still easing in
      RL.handView($item.find('.graph-box').get(0), {
        on: () => isWhole($item) && !!svgNow(),
        pan: (dx, dy) => {
          const svg = svgNow(), v = vb(svg), r = svg.getBoundingClientRect()
          if (!svg.__fullViewBox) svg.__fullViewBox = v.join(' ')
          const k = Math.max(v[2] / r.width, v[3] / r.height)
          put(svg, [v[0] - dx * k, v[1] - dy * k, v[2], v[3]])
        },
        zoom: (f, x, y) => {
          const svg = svgNow(), v = vb(svg), r = svg.getBoundingClientRect(), box = svg.parentNode.getBoundingClientRect()
          if (!svg.__fullViewBox) svg.__fullViewBox = v.join(' ')
          const full = svg.__fullViewBox.split(/[\s,]+/).map(Number)
          const k = Math.max(v[2] / r.width, v[3] / r.height)
          const px = v[0] + (x + box.left - r.left) * k, py = v[1] + (y + box.top - r.top) * k   // the drawing's point under the pointer
          const w = Math.max(full[2] / 20, Math.min(full[2] * 2, v[2] / f)), s = w / v[2]
          put(svg, [px - (px - v[0]) * s, py - (py - v[1]) * s, w, v[3] * s])
        },
        reset: () => { const svg = svgNow(); if (svg) walkZoom(svg, null) }
      })
    }
    // Follow the other timeline, map and drawing items in the lineup, and the full
    // tools in other tabs. A walk played elsewhere stops this one (and a build);
    // a click elsewhere is ignored while either is open. A box is lit by its own
    // id, as a drawing node or as a place (a sketch area and its map area share one id).
    if (RL) RL.join(elG, 'sketch', msg => {
      const g = graphModel(item)
      if (!g || !$item.find('svg').length) return false
      const walkStep = msg.type === 'rcn-walk' && !msg.end
      if (wk.w !== null) { if (!walkStep) return false; walkEnd() }
      if (buildIdx !== null) { if (!walkStep) return false; buildIdx = null; showBuildStep($item, g, null) }
      const have = new Set(g.nodes.map(n => String(n.id)))
      const mine = [...new Set([...(msg.eips || []), ...(msg.places || [])])].map(String).filter(id => have.has(id))
      const was = elG.rcnFollow || null, f = RL.update(was, msg, mine)
      if (f === was) return false
      elG.rcnFollow = f
      if (f && f.lit) showFollow($item, g, f); else showWalkStep($item, g, null, null)
      return !!(f && f.lit)
    })
    // A click on a box lights it in the items beside it. Its label still opens its
    // page when nothing beside it lights up; shift-click always opens the page, at
    // the end of the lineup. A click on the empty drawing lets go.
    const nodeOf = t => { const n = t && t.closest && t.closest('g[id^="node-"]'); return n ? n.id.slice(5) : null }
    const followNode = (id, label) => {
      if (!RL || wk.w !== null || buildIdx !== null) return 0
      if (elG.rcnFollow) { elG.rcnFollow = null; showWalkStep($item, graphModel(item), null, null) }
      return RL.click(elG, 'sketch', { eip: id, label })
    }
    $item.off('click.rcnfollow').on('click.rcnfollow', '.graph-box svg', e => {
      if ($(e.target).closest('a.internal').length) return
      const id = nodeOf(e.target)
      if (id) followNode(id)
      else if (RL && elG.rcnClicked) RL.click(elG, 'sketch', { clear: true })
    })
    $item.off('.rcnwalk')
    $item.on('click.rcnwalk', '.walk-start', () => {
      const g = graphModel(item)
      if (!g) return
      if (buildIdx !== null) { buildIdx = null; showBuildStep($item, g, null) }
      wk.w = +($item.find('.walk-pick').val() || 0)
      wk.heard = null
      walkShow(0)
      walkToggle()   // a click is a user gesture, so the browser will speak
      $item.find('.walk-bar').trigger('focus')
    })
    $item.on('click.rcnwalk', '.walk-play', () => walkToggle())
    // ● Video (tools/rcn-record.js): record the chosen walk as a video file. The
    // picture is this item's page, or the whole lineup when other items follow.
    $item.on('click.rcnwalk', '.walk-video', e => {
      e.stopPropagation()
      const ws = (graphModel(item) ? walkList(graphModel(item)) : []), i = +($item.find('.walk-pick').val() || 0)
      window.RCNRecord.cropEl = () => (RL && RL.others(elG)) ? document.querySelector('.main') : ($item.closest('.page')[0] || null)
      window.RCNRecord.open(() => $item.find('.walk-start').trigger('click'), (ws[i] || {}).name)
    })
    $item.on('click.rcnwalk', '.walk-prev', () => walkShow(wk.i - 1))
    $item.on('click.rcnwalk', '.walk-next', () => walkShow(wk.i + 1))
    $item.on('click.rcnwalk', '.walk-close', () => walkEnd())
    $item.on('change.rcnwalk', '.walk-speaker', e => { recSetSpeaker(e.target.value); if (wk.playing) walkSpeak() })
    const fillVoices = () => {
      const p = walkPrefs()
      $item.find('.walk-voicesel').html(voiceOptions())
      $item.find('.walk-rate').val(p.rate)
      $item.find('.walk-rate-val').text(Math.round(p.rate * 100) + '%')
      $item.find('.walk-voicehint').text(voiceHint())
    }
    const sample = () => { walkPause(); voiceSample() }
    $item.on('click.rcnwalk', '.walk-voiceset', () => { wk.vp = !wk.vp; if (wk.vp) fillVoices(); walkUI() })
    $item.on('change.rcnwalk', '.walk-voicesel', e => { walkSetPref('voice', e.target.value); sample() })
    $item.on('input.rcnwalk', '.walk-rate', e => {
      const r = Math.max(0.6, Math.min(1.4, +e.target.value || 0.95))
      walkSetPref('rate', r)
      $item.find('.walk-rate-val').text(Math.round(r * 100) + '%')
    })
    $item.on('click.rcnwalk', '.walk-sample', () => sample())
    // Voices arrive late in Chrome; refresh an open panel when they do. One listener
    // per item however often it is bound; it calls the latest binding's fillVoices.
    const el0 = $item.get(0)
    el0.rcnFillVoices = () => { if (wk.vp) fillVoices() }
    if (!el0.rcnVoiceListen && window.speechSynthesis && speechSynthesis.addEventListener) {
      el0.rcnVoiceListen = true
      speechSynthesis.addEventListener('voiceschanged', () => { if (document.body.contains(el0) && el0.rcnFillVoices) el0.rcnFillVoices() })
    }
    $item.on('click.rcnwalk', '.walk-voice', () => {
      const on = !walkPrefs().on
      try { localStorage.setItem('rcnWalkVoice', on ? 'on' : 'off') } catch (e) {}
      if (!on) stopVoice()
      if (wk.playing) walkSpeak()
      walkUI()
    })
    // Clicking the drawing to look closer pauses the voice.
    $item.on('pointerdown.rcnwalk', '.graph-box', () => { if (wk.playing) walkPause() })
    $item.on('keydown.rcnwalk', '.walk-bar', e => {
      if (wk.w === null || $(e.target).is('select, input')) return
      if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); walkToggle() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); walkShow(wk.i + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); walkShow(wk.i - 1) }
      else if (e.key === 'Escape') { e.preventDefault(); walkEnd() }
    })
    // Labels in the saved SVG are wrapped as <a class="internal" data-title=…>, but
    // two things stopped a click reaching the page: the <text> keeps the canvas's
    // pointer-events="none", so the click fell through to the box behind it; and
    // FedWiki's own .internal handler names the page from the clicked <tspan>, so a
    // two-line label would land on its first line. Follow data-title here instead.
    // Namespaced and reset, because a save re-runs bind on the same element.
    $item.off('click.rcnlink').on('click.rcnlink', 'svg a.internal', e => {
      e.preventDefault()
      e.stopPropagation()
      const title = e.currentTarget.getAttribute('data-title'), id = nodeOf(e.currentTarget)
      if (!e.shiftKey && id && followNode(id, title)) return
      // beside items that follow, open it at the end so they stay open
      if (title) wiki.doInternalLink(title, e.shiftKey || (RL && RL.others(elG)) ? null : $item.parents('.page:first'))
    })
  }

  // Recordings live as files in this site's assets (assets/voice-files), one file per
  // recording, named by its content. On save, any recording still held inside a walk
  // (a data: URL from a walk editor) is uploaded there and replaced by the file's full
  // address, so a page and its history keep only addresses, a recording is never
  // stored twice, and a forked page still plays from the site that has the file.
  // If the upload fails (not signed in, say) the recording stays inside the walk, so
  // nothing is lost, and the next save that can upload moves it out.
  const VOICE_FOLDER = 'voice-files'
  function voiceSteps(walks) {
    const out = []
    for (const w of walks || []) for (const st of (w && w.steps) || []) {
      for (const n of Object.keys((st && st.voices) || {})) {
        const v = st.voices[n]
        if (v && typeof v.audio === 'string' && /^data:audio\//.test(v.audio)) out.push(v)
      }
    }
    return out
  }
  async function voiceFile(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob()
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
    const hex = [...sum.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('')
    const ext = /mpeg|mp3/.test(blob.type) ? 'mp3' : /mp4|m4a|aac/.test(blob.type) ? 'm4a' : /wav/.test(blob.type) ? 'wav' : /ogg/.test(blob.type) ? 'ogg' : 'webm'
    const name = hex + '.' + ext
    const url = location.origin + '/assets/' + VOICE_FOLDER + '/' + name
    const have = await fetch(url, { method: 'HEAD', cache: 'no-store' }).then(r => r.ok, () => false)
    if (!have) {
      const form = new FormData()
      form.append('assets', VOICE_FOLDER)   // before the file: the server reads the folder first
      form.append('uploads[]', blob, name)
      const r = await fetch('/plugin/assets/upload', { method: 'POST', body: form, credentials: 'same-origin' })
      if (!r.ok) throw new Error(r.status === 401 ? 'sign in to this wiki to save recordings as files' : 'upload failed (' + r.status + ')')
    }
    return url
  }
  // Move every embedded recording in these walks to a file; resolves to a note
  // for the reader when some could not be moved, else ''.
  async function voicesToFiles(walks) {
    const vs = voiceSteps(walks)
    let failed = '', n = 0
    for (const v of vs) {
      try { v.audio = await voiceFile(v.audio); n++ } catch (e) { failed = e.message || String(e) }
    }
    if (n) console.log('voice files: ' + n + ' recording' + (n === 1 ? '' : 's') + ' now point to assets/' + VOICE_FOLDER + ' (each file is uploaded once)')
    return failed ? 'Recordings were kept inside the page: ' + failed + '.' : ''
  }
  function voiceNotice($item, msg) {
    $item.find('.voice-note').remove()
    if (msg) $item.append($('<div class="voice-note" style="font-size:12px;color:#92400e;padding:4px 0"></div>').text(msg))
  }

  function graphListener(event) {
    if (!event.source || !event.source.opener) return
    if (!event.data || event.data.toolType !== 'rcn-graph') return

    const { data } = event

    switch (data.action) {
      case 'graphToolReady': {
        if (pendingItem) {
          const pageTitle = pending$item ? pending$item.parents('.page').data('title') : undefined
          event.source.postMessage({ action: 'loadGraph', graphJSON: pendingItem.graphJSON || null, pageTitle }, '*')
        }
        break
      }
      case 'saveGraph': {
        if (!pendingItem || !pending$item) break
        const item = pendingItem, $item = pending$item
        let g = data.graphJSON
        const asText = typeof g === 'string'
        try { if (asText) g = JSON.parse(g) } catch (e) { g = null }
        const moved = g && voiceSteps(g.walks).length ? voicesToFiles(g.walks) : Promise.resolve('')
        moved.then(note => {
          item.graphJSON = g ? (asText ? JSON.stringify(g) : g) : data.graphJSON
          item.svgString = data.svgString
          wiki.pageHandler.put($item.parents('.page:first'), { type: 'edit', id: item.id, item })
          renderContent($item, item)
          bind($item, item)
          voiceNotice($item, note)
        })
        break
      }
      case 'doInternalLink': {
        const { title, site, pageKey, keepLineup } = data
        const $page = keepLineup
          ? null
          : $('.page').filter((i, el) => $(el).data('key') == pageKey)
        wiki.doInternalLink(title, $page, site)
        break
      }
      case 'showResult': {
        wiki.showResult(wiki.newPage(data.page), { $page: data.keepLineup ? null : undefined })
        break
      }
      default:
        if (wiki.debug) console.log('rcngraph listener — unknown action:', data)
    }
  }

  // CSS outranks SVG presentation attributes, so this re-enables clicks on labels
  // in items saved before the Graph Tool stopped writing pointer-events="none".
  if (typeof document !== 'undefined' && !document.getElementById('rcngraph-link-style')) {
    const s = document.createElement('style')
    s.id = 'rcngraph-link-style'
    s.textContent = '.rcngraph svg a.internal text,.rcn-graph svg a.internal text{pointer-events:auto;cursor:pointer}'
    document.head.appendChild(s)
  }

  if (typeof window !== 'undefined') {
    window.plugins['rcngraph'] = { emit, bind }
    if (!window.rcnGraphListener) {
      window.rcnGraphListener = graphListener
      window.addEventListener('message', graphListener)
    }
  }

})()
