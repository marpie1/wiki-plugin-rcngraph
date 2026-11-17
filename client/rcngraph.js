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
  function showWalkStep($item, g, walk, i) {
    const svg = $item.find('svg').get(0)
    if (!svg) return
    svg.querySelectorAll('.rcn-walk-ring').forEach(el => el.remove())
    $item.find('.graph-box').css('max-height', i === null ? '280px' : 'none')
    if (i === null) {
      g.nodes.forEach(n => { const el = groupFor(svg, 'node', n.id); if (el) el.style.opacity = '' })
      g.edges.forEach(e => { const el = groupFor(svg, 'edge', e.id); if (el) el.style.opacity = '' })
      walkZoom(svg, null)
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
    walkZoom(svg, lit ? [...lit.nodes].map(id => groupFor(svg, 'node', id)).filter(Boolean) : null)
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
    walkZoom(svg, [...f.lit].map(id => groupFor(svg, 'node', id)).filter(Boolean))
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
      if ($(e.target).closest('.build-bar, .walk-bar').length) return
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
      $bar.find('.walk-start, .walk-pick').toggle(!open)
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
