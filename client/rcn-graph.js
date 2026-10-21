(function () {

  // Kept in step with client/rcngraph.js — farm sites are alice.localhost etc., so
  // match the suffix rather than the bare hostname.
  const LOCAL = /(^|\.)localhost$/.test(window.location.hostname)
  const GRAPH_URL = LOCAL
    ? 'http://localhost:8765/tools/graph-tool-v22.html'
    : 'https://marc.relocalizecreativity.net/assets/Drag/graph-tool-v22.html'
  const WINDOW_NAME = 'rcngraph'

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
      // A ring on what this step brings in for the first time.
      if (lit && lit.nodes.has(String(n.id)) && !seen.nodes.has(String(n.id)) && n.w && n.h) {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
        r.setAttribute('class', 'rcn-walk-ring')
        r.setAttribute('cx', '0'); r.setAttribute('cy', '0')
        r.setAttribute('rx', String(n.w / 2 + 9)); r.setAttribute('ry', String(n.h / 2 + 9))
        r.setAttribute('fill', 'none'); r.setAttribute('stroke', BUILD_COLOR)
        r.setAttribute('stroke-width', '3'); r.setAttribute('opacity', '.8')
        r.setAttribute('pointer-events', 'none')
        el.appendChild(r)
      }
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
              <button class="walk-close" style="${b}display:none" title="Stop the walk (Esc)">■ Stop</button>
            </div>
            <div class="walk-say" aria-live="polite" style="display:none;margin:8px 4px 0;padding:10px 12px;background:#fff;border:1px solid #c7d2fe;border-radius:8px;font-size:17px;line-height:1.45;color:#1e1b4b"></div>
            <div class="walk-note" style="font-size:11px;color:#64748b;text-align:center;margin-top:3px"></div>
          </div>`
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
          </div>
          ${buildBar(item)}
          ${walkBar(item)}
        </div>
      `)
    } else {
      $item.append(`
        <div style="background-color:#eee;padding:15px;text-align:center;">
          <p style="font-weight:bold;margin:0 0 6px;">RCN Graph Tool</p>
          <p style="color:#666;font-size:0.85em;margin:0 0 12px;">CLD · EIP · NRM · Trace · Wardley · OPM · SFD · LOP · VSM</p>
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

  function bind($item, item) {
    aboutMark($item, 'rcngraph')
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
    const curWalk = () => { const g = graphModel(item); return g && wk.w !== null ? walkList(g)[wk.w] : null }
    const stopVoice = () => { wk.token++; try { if (window.speechSynthesis) speechSynthesis.cancel() } catch (e) {} }
    const walkUI = note => {
      const walk = curWalk(), open = !!walk
      if (note) wk.heard = wk.i; else if (wk.playing) wk.heard = null
      const $bar = $item.find('.walk-bar')
      $bar.find('.walk-prev, .walk-next, .walk-play, .walk-count, .walk-voice, .walk-close').toggle(open)
      $bar.find('.walk-start, .walk-pick').toggle(!open)
      $bar.find('.walk-say').toggle(open)
      $bar.find('.walk-play').text(wk.playing ? '❚❚' : '▶')
      $bar.find('.walk-voice').text(walkPrefs().on ? '🔈 Voice on' : '🔇 Voice off')
      $bar.find('.walk-count').text(open ? 'Step ' + (wk.i + 1) + ' of ' + walk.steps.length : '')
      $bar.find('.walk-note').text(note || (open && !wk.playing ? 'Space plays · ← → step · Esc stops' : ''))
    }
    const walkShow = i => {
      const g = graphModel(item), walk = curWalk()
      if (!walk) return
      wk.i = Math.max(0, Math.min(walk.steps.length - 1, i))
      stopVoice()
      showWalkStep($item, g, walk, wk.i)
      const st = walk.steps[wk.i]
      $item.find('.walk-say').text(st.say || '').css({ color: st.ask ? '#7c2d12' : '#1e1b4b', fontStyle: st.ask ? 'italic' : 'normal' })
      walkUI()
      if (wk.playing) walkSpeak()
    }
    const walkSpeak = () => {
      const tok = ++wk.token, walk = curWalk(), st = walk && walk.steps[wk.i]
      if (!st) return
      walkSay(st.say, () => tok === wk.token && activeWalk === wk, () => {
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
      walkUI()
    }
    wk.end = walkEnd
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
      if (wk.w === null || $(e.target).is('select')) return
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
      const title = e.currentTarget.getAttribute('data-title')
      if (title) wiki.doInternalLink(title, e.shiftKey ? null : $item.parents('.page:first'))
    })
  }

  function graphListener(event) {
    if (!event.source || !event.source.opener) return
    if (!event.data || event.data.toolType !== 'rcn-graph') return
    if (!pendingItem || !pending$item) return

    const { data } = event

    switch (data.action) {
      case 'graphToolReady': {
        const pageTitle = pending$item.parents('.page').data('title')
        event.source.postMessage({ action: 'loadGraph', graphJSON: pendingItem.graphJSON || null, pageTitle }, '*')
        break
      }
      case 'saveGraph': {
        pendingItem.graphJSON = data.graphJSON
        pendingItem.svgString = data.svgString
        const $page = pending$item.parents('.page:first')
        wiki.pageHandler.put($page, { type: 'edit', id: pendingItem.id, item: pendingItem })
        renderContent(pending$item, pendingItem)
        bind(pending$item, pendingItem)
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
        if (wiki.debug) console.log('rcn-graph listener — unknown action:', data)
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
    window.plugins['rcn-graph'] = { emit, bind }
    if (!window.rcnGraphLegacyListener) {
      window.rcnGraphLegacyListener = graphListener
      window.addEventListener('message', graphListener)
    }
  }

})()
