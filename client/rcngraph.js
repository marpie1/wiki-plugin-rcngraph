(function () {

  const GRAPH_URL = 'https://marc.relocalizecreativity.net/assets/Drag/graph-tool-v22.html'
  const WINDOW_NAME = 'rcngraph'

  // Track which item/element opened the current popup
  let pendingItem = null
  let pending$item = null

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
        </div>
      `)
    } else {
      $item.append(`
        <div style="background-color:#eee;padding:15px;text-align:center;">
          <p style="font-weight:bold;margin:0 0 6px;">RCN Graph Tool</p>
          <p style="color:#666;font-size:0.85em;margin:0 0 12px;">CLD · EIP · OPM · VSM · NRM</p>
          <button class="open-graph" style="cursor:pointer;">Open Graph Tool ↗</button>
        </div>
      `)
    }
  }

  function emit($item, item) {
    renderContent($item, item)
  }

  function bind($item, item) {
    $item.on('click', '.open-graph, .edit-graph', () => {
      pendingItem = item
      pending$item = $item
      const popup = window.open(GRAPH_URL, WINDOW_NAME, 'popup,height=820,width=1440')
      if (popup) popup.focus()
    })
    $item.on('dblclick', () => wiki.textEditor($item, item))
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

  if (typeof window !== 'undefined') {
    window.plugins['rcngraph'] = { emit, bind }
    if (!window.rcnGraphListener) {
      window.rcnGraphListener = graphListener
      window.addEventListener('message', graphListener)
    }
  }

})()
