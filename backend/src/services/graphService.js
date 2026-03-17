function buildGraph(topics, edges) {
    return {
      nodes: topics.map(t => ({
        id: t.id,
        label: t.name
      })),
      edges: edges.map(e => ({
        source: e.from,
        target: e.to
      }))
    }
  }
  
  function topologicalSort(nodes, edges) {
    const inDegree = {}
  
    nodes.forEach(n => inDegree[n.id] = 0)
  
    edges.forEach(e => {
      inDegree[e.target]++
    })
  
    const queue = []
    Object.keys(inDegree).forEach(id => {
      if (inDegree[id] === 0) queue.push(id)
    })
  
    const order = []
  
    while (queue.length) {
      const current = queue.shift()
      order.push(current)
  
      edges.forEach(e => {
        if (e.source === current) {
          inDegree[e.target]--
          if (inDegree[e.target] === 0) {
            queue.push(e.target)
          }
        }
      })
    }
  
    return order
  }
  
  function isUnlocked(nodeId, edges, completedNodes) {
    const prereqs = edges
      .filter(e => e.target === nodeId)
      .map(e => e.source)
  
    return prereqs.every(p => completedNodes.includes(p))
  }
  
  module.exports = {
    buildGraph,
    topologicalSort,
    isUnlocked
  }