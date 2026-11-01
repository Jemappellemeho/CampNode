export function computeRetroGridLayout(
  coreNodes: any[],
  aiNodes: any[],
  cols: number,
  availableWidth: number,
  xPadding: number,
  isSm: boolean,
) {
  // 3. Coordinate Calculator
  // Takes a node's number in line (index) and figures out its (x, y) position on a zig-zag grid.
  // It goes left-to-right, drops down a row, then goes right-to-left.
  const getGridCoords = (index: number) => {
    const y = Math.floor(index / cols);
    const x = y % 2 === 0 ? index % cols : (cols - 1) - (index % cols);
    return { x, y };
  };

  // Figure out the maximum number of columns we actually used so the map stays centered
  const maxColIndex = coreNodes.reduce((max, node) => Math.max(max, getGridCoords(node.listIndex).x), 0);
  const actualCols = coreNodes.length > 0 ? maxColIndex + 1 : 1;

  // ============================================================================
  // RESPONSIVE BOX SIZING
  // ============================================================================
  // We dynamically stretch or shrink the invisible grid boxes based on screen width.
  const dynamicCellWidth = availableWidth / actualCols;
  const cellWidth = Math.max(120, dynamicCellWidth); 
  const cellHeight = cellWidth * 0.8; // Keeps a nice 4:5 rectangular ratio

  // However, the physical visual boxes (the colored squares) stay fixed sizes 
  // so they don't squish when the syllabus drawer opens.
  const coreNodeSize = isSm ? 70 : 100;
  const aiNodeSize = coreNodeSize * 0.8;
  const xOffset = xPadding;

  // Group all AI nodes by their parent, so we know how many branch off from each spot
  const aiNodesByParent: { [parentId: string]: typeof aiNodes } = {};
  aiNodes.forEach(node => {
    if (!aiNodesByParent[node.parentId]) aiNodesByParent[node.parentId] = [];
    aiNodesByParent[node.parentId].push(node);
  });

  // ============================================================================
  // DYNAMIC HEIGHT CALCULATION (PREVENTING OVERLAPS)
  // ============================================================================
  // If a row has AI nodes branching out downwards, it needs extra vertical space 
  // so it doesn't crash into the row beneath it.
  
  const maxAiNodesPerRow: { [row: number]: number } = {};
  coreNodes.forEach(node => {
    const coords = getGridCoords(node.listIndex);
    const aiCount = (aiNodesByParent[node.id] || []).length;
    maxAiNodesPerRow[coords.y] = Math.max(maxAiNodesPerRow[coords.y] || 0, aiCount);
  });

  // Calculate the exact pixel 'Y' height for every single row on the screen
  const rowOffsets: { [row: number]: number } = { 0: cellHeight / 2 };
  const maxRows = Math.ceil(coreNodes.length / cols);
  for (let y = 1; y < maxRows; y++) {
    const prevRowAiCount = maxAiNodesPerRow[y - 1] || 0;
    const extraHeight = prevRowAiCount > 0 ? (prevRowAiCount * (aiNodeSize + 30)) : 0;
    rowOffsets[y] = rowOffsets[y - 1] + cellHeight + extraHeight;
  }

  // ============================================================================
  // FINAL PIXEL COORDINATES
  // ============================================================================
  // Convert grid coordinates into exact pixel coordinates (px, py) for drawing the SVG lines.

  // Core Nodes (Straight lines)
  const coreCoordsMap: { [id: string]: { x: number, y: number, px: number, py: number } } = {};
  coreNodes.forEach((node) => {
    const coords = getGridCoords(node.listIndex);
    coreCoordsMap[node.id] = {
      x: coords.x,
      y: coords.y,
      px: coords.x * cellWidth + cellWidth / 2 + xOffset,
      py: rowOffsets[coords.y] || (coords.y * cellHeight + cellHeight / 2)
    };
  });

  // AI Nodes (Branching lines)
  const aiCoordsMap: { [id: string]: { px: number, py: number, parentPx: number, parentPy: number, forkY: number } } = {};
  Object.values(aiNodesByParent).forEach((nodesForParent) => {
    nodesForParent.forEach((node, localIdx) => {
      const parentCoords = coreCoordsMap[node.parentId];
      if (parentCoords) {
        // Decide whether the branch goes left or right so it doesn't leave the screen
        const direction = parentCoords.x === cols - 1 ? -1 : 1;
        const offsetX = (cellWidth / 2) * direction;
        // Stack them vertically if there are multiple AI nodes attached to the same parent
        const offsetY = (cellHeight * 0.6) + (localIdx * (aiNodeSize + 30));
        
        aiCoordsMap[node.id] = {
          px: parentCoords.px + offsetX,
          py: parentCoords.py + offsetY,
          parentPx: parentCoords.px,
          parentPy: parentCoords.py,
          forkY: parentCoords.py + (cellHeight * 0.35) // The elbow joint of the SVG line
        };
      }
    });
  });

  // Generate Core SVG Paths (Straight lines with juice effect)
  interface CorePath {
    d: string;
    color: string;
    isGlowing: boolean;
    key: string;
  }
  const corePaths: CorePath[] = [];
  for (let i = 0; i < coreNodes.length - 1; i++) {
    const p1 = coreCoordsMap[coreNodes[i].id];
    const p2 = coreCoordsMap[coreNodes[i+1].id];
    const d = `M ${p1.px} ${p1.py} L ${p2.px} ${p2.py}`;
    
    const n2 = coreNodes[i+1];
    
    // Line color matches the destination node's type
    const color = n2.isMain ? '#3A9E3F' : '#3B82F6'; // Green for main, Blue for sub
    
    // Always glow for aesthetic!
    const isGlowing = true;

    corePaths.push({ d, color, isGlowing, key: `core-line-${i}` });
  }

  // Generate AI SVG Paths (Sequential circuit-board path)
  interface AiPath {
    d: string;
    color: string;
    isGlowing: boolean;
    key: string;
  }
  const aiPaths: AiPath[] = [];
  Object.values(aiNodesByParent).forEach((nodesForParent) => {
    nodesForParent.forEach((node, localIdx) => {
      const coords = aiCoordsMap[node.id];
      if (coords) {
        const color = '#EF4444'; // AI paths are always red
        const isGlowing = true; // Always glow for aesthetic!
        
        let d = "";
        if (localIdx === 0) {
          d = `M ${coords.parentPx} ${coords.parentPy} L ${coords.parentPx} ${coords.forkY} L ${coords.px} ${coords.forkY} L ${coords.px} ${coords.py}`;
        } else {
          const prevNode = nodesForParent[localIdx - 1];
          const prevCoords = aiCoordsMap[prevNode.id];
          d = `M ${prevCoords.px} ${prevCoords.py} L ${coords.px} ${coords.py}`;
        }

        aiPaths.push({ d, color, isGlowing, key: `ai-line-${node.id}` });
      }
    });
  });

  const containerWidth = (actualCols * cellWidth) + (xOffset * 2);
  const lastRowY = maxRows > 0 ? rowOffsets[maxRows - 1] : 0;
  const lastRowAiCount = maxAiNodesPerRow[maxRows - 1] || 0;
  const extraBottomHeight = lastRowAiCount > 0 ? (lastRowAiCount * (aiNodeSize + 30)) : 0;
  const containerHeight = Math.max(window.innerHeight, lastRowY + extraBottomHeight + 300);
  return { coreCoordsMap, aiCoordsMap, corePaths, aiPaths, coreNodeSize, aiNodeSize, containerWidth, containerHeight };
}