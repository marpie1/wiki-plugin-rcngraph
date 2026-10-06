(function () {

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

  function renderContent($item, item) {
    $item.empty()
    if (item.svgString) {
      $item.append(`
        <div style="background:#f5f5f5;padding:8px;">
          <div style="overflow:auto;max-height:280px;border:1px solid #ddd;background:#fff;">
            ${item.svgString}
          </div>
          <div style="padding:6px 0 0;display:flex;gap:6px;justify-content:center;">
            <button class="edit-graph" style="cursor:pointer;">Edit in Graph Tool ↗</button>
          </div>
          ${buildBar(item)}
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
      // Stepping a build is quick clicking — never let it open the editor.
      if ($(e.target).closest('.build-bar').length) return
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
