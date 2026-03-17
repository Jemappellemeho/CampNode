const prisma = require("../utils/prisma");
const graphService = require("../services/graphService");

exports.getGraph = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    // 1. Get topics
    const topics = await prisma.topic.findMany({
      where: { courseId }
    });

    // TEMP: fake edges (until DB supports prerequisites)
    const edges = [];

    // 2. Get user progress
    const progress = await prisma.progress.findMany({
      where: { userId }
    });

    const completedNodes = progress
      .filter(p => p.completed)
      .map(p => p.topicId);

    // 3. Build graph
    const graph = graphService.buildGraph(topics, edges);

    // 4. Learning order
    const order = graphService.topologicalSort(graph.nodes, graph.edges);

    // 5. Add unlock status
    const nodesWithState = graph.nodes.map(node => ({
      ...node,
      unlocked: graphService.isUnlocked(node.id, graph.edges, completedNodes),
      completed: completedNodes.includes(node.id)
    }));

    res.json({
      nodes: nodesWithState,
      edges: graph.edges,
      order
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Graph error" });
  }
};