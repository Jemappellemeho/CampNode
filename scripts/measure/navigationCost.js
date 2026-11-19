import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIEWPORT_WIDTH = 1900;
const VIEWPORT_HEIGHT = 870;
// Model assumption: 1.2 s per click.
const SECONDS_PER_CLICK = 1.2;
// Model assumption: 1.5 s per viewport-sized scroll.
const SECONDS_PER_SCROLL = 1.5;
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));

function requireEnvironment() {
  const missing = ['TEST_EMAIL', 'TEST_PASSWORD', 'COURSE_ID']
    .filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
  return {
    email: process.env.TEST_EMAIL,
    password: process.env.TEST_PASSWORD,
    courseId: process.env.COURSE_ID,
  };
}

function parseViolationLabel(label) {
  const match = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(label.trim());
  if (!match) {
    throw new Error(`Could not parse rendered violation label: ${label}`);
  }
  return { number: match[1], name: match[2] };
}

function parseRenderedViolations(titles) {
  const violations = new Map();
  const violationPattern = /"([^"\r\n]+)" needs "([^"\r\n]+)", but \d+(?:\.\d+)? comes later\./g;

  for (const title of titles) {
    for (const match of title.matchAll(violationPattern)) {
      const item = parseViolationLabel(match[1]);
      const prerequisite = parseViolationLabel(match[2]);
      const key = `${prerequisite.number}->${item.number}`;
      violations.set(key, {
        prerequisite,
        item,
        label: `${prerequisite.number} ${prerequisite.name} -> ${item.number} ${item.name}`,
      });
    }
  }
  return [...violations.values()];
}

function compareCourseNumbers(first, second) {
  const firstParts = first.split('.').map(Number);
  const secondParts = second.split('.').map(Number);
  for (let index = 0; index < Math.max(firstParts.length, secondParts.length); index += 1) {
    const difference = (firstParts[index] || 0) - (secondParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function violationKey(violation) {
  return `${violation.prerequisite.number}->${violation.item.number}`;
}

function buildRepairMoves(violations) {
  const groups = new Map();
  for (const violation of violations) {
    const prerequisiteNumber = violation.prerequisite.number;
    const group = groups.get(prerequisiteNumber) || [];
    group.push(violation);
    groups.set(prerequisiteNumber, group);
  }

  const byViolation = new Map();
  const moves = [...groups.entries()].map(([prerequisiteNumber, relatedViolations], index) => {
    const target = [...relatedViolations].sort((a, b) =>
      compareCourseNumbers(a.item.number, b.item.number),
    )[0];
    const move = { id: `M${index + 1}`, prerequisiteNumber, target };
    for (const violation of relatedViolations) {
      byViolation.set(violationKey(violation), {
        id: move.id,
        isTarget: violation.item.number === target.item.number,
      });
    }
    return move;
  });
  return { moves, byViolation };
}

function viewportScreens(dx, dy) {
  return Math.max(Math.abs(dx) / VIEWPORT_WIDTH, Math.abs(dy) / VIEWPORT_HEIGHT);
}

async function renderedListViolations(page) {
  const titles = await page.locator('span[title]').evaluateAll((markers) =>
    markers.map((marker) => marker.getAttribute('title') || ''),
  );
  return parseRenderedViolations(titles);
}

async function getListTopicMeasurements(page) {
  const topics = await page.locator('div[draggable="true"]').evaluateAll((elements) =>
    elements.flatMap((card) => {
      const header = card.firstElementChild;
      const heading = header?.querySelector('h3');
      if (!heading) return [];
      const number = [...(header?.querySelectorAll('span') || [])]
        .map((span) => span.textContent?.trim() || '')
        .find((text) => /^\d+$/.test(text));
      if (!number) return [];
      return [{
        number,
        height: card.getBoundingClientRect().height,
      }];
    }),
  );
  return topics;
}

async function getListViewRegion(page) {
  const region = await page.locator('div[draggable="true"]').evaluateAll((elements) => {
    const cards = elements.filter((card) => {
      const header = card.firstElementChild;
      const number = [...(header?.querySelectorAll('span') || [])]
        .map((span) => span.textContent?.trim() || '')
        .find((text) => /^\d+$/.test(text));
      return !!header?.querySelector('h3') && !!number;
    }).filter((card) => !card.parentElement?.closest('div[draggable="true"]'));
    const parents = [...new Set(cards.map((card) => card.parentElement))];
    if (parents.length !== 1 || !parents[0]) return null;
    const rect = parents[0].getBoundingClientRect();
    return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY };
  });
  if (!region) throw new Error('Could not measure the LIST topic-card region.');
  return region;
}

async function setListTopicExpanded(page, topicNumber, expanded) {
  const changed = await page.locator('div[draggable="true"]').evaluateAll((elements, request) => {
    const card = elements.find((element) => {
      const header = element.firstElementChild;
      const hasHeading = !!header?.querySelector('h3');
      const number = [...(header?.querySelectorAll('span') || [])]
        .map((span) => span.textContent?.trim() || '')
        .find((text) => /^\d+$/.test(text));
      return hasHeading && number === request.topicNumber;
    });
    if (!card) throw new Error(`Could not find LIST topic ${request.topicNumber}.`);
    const isExpanded = card.querySelector('div[draggable="true"]') !== null;
    if (isExpanded !== request.expanded) {
      const toggle = card.firstElementChild?.querySelector(':scope > button');
      if (!toggle) throw new Error(`Could not find the LIST toggle for topic ${request.topicNumber}.`);
      toggle.click();
      return true;
    }
    return false;
  }, { topicNumber, expanded });

  if (changed) {
    await page.waitForFunction(({ topicNumber, expanded: target }) => {
      const card = [...document.querySelectorAll('div[draggable="true"]')].find((element) => {
        const header = element.firstElementChild;
        const number = [...(header?.querySelectorAll('span') || [])]
          .map((span) => span.textContent?.trim() || '')
          .find((text) => /^\d+$/.test(text));
        return !!header?.querySelector('h3') && number === topicNumber;
      });
      return !!card && (card.querySelector('div[draggable="true"]') !== null) === target;
    }, { topicNumber, expanded }, { timeout: 5000 });
  }
  return changed;
}

async function getListRowRect(page, number) {
  const rect = await page.locator('span').evaluateAll((spans, requestedNumber) => {
    const marker = spans.find((span) => span.textContent?.trim() === requestedNumber);
    const row = marker?.closest('div[draggable="true"]');
    if (!row) return null;
    const box = row.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top + window.scrollY,
      width: box.width,
      height: box.height,
      centerX: box.left + box.width / 2,
      centerY: box.top + window.scrollY + box.height / 2,
    };
  }, number);
  if (!rect) throw new Error(`Could not measure rendered LIST row ${number}.`);
  return rect;
}

function parentTopicsFor(violation) {
  return [...new Set([violation.prerequisite.number, violation.item.number]
    .filter((number) => number.includes('.'))
    .map((number) => number.split('.')[0]))];
}

async function measureList(page, violations, topicMeasurements, repairMovesByViolation) {
  const region = await getListViewRegion(page);
  const startScroll = await page.evaluate(() => window.scrollY);
  const maxScroll = await page.evaluate(() => Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  ));
  const entryTarget = scrollTargetForRange(
    region.top,
    Math.min(region.bottom, region.top + VIEWPORT_HEIGHT),
    VIEWPORT_HEIGHT,
    maxScroll,
    startScroll,
  );
  const entry = {
    clicks: 0,
    scrollSteps: Math.ceil(Math.abs(entryTarget - startScroll) / VIEWPORT_HEIGHT),
  };
  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), entryTarget);
  const results = [];
  const rowHeights = new Map();
  for (const violation of violations) {
    const parents = parentTopicsFor(violation);
    let clicks = 0;
    for (const topicNumber of parents) {
      if (await setListTopicExpanded(page, topicNumber, true)) clicks += 1;
    }

    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), entryTarget);
    const prerequisite = await getListRowRect(page, violation.prerequisite.number);
    const item = await getListRowRect(page, violation.item.number);
    rowHeights.set(violation.prerequisite.number, prerequisite.height);
    rowHeights.set(violation.item.number, item.height);
    const maxScroll = await page.evaluate(() => Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    ));
    const scrollSteps = axisRouteSteps(
      prerequisite.top,
      prerequisite.top + prerequisite.height,
      item.top,
      item.top + item.height,
      VIEWPORT_HEIGHT,
      maxScroll,
      entryTarget,
    );
    const repairMove = repairMovesByViolation.get(violationKey(violation));
    const dragScreens = repairMove?.isTarget
      ? viewportScreens(
        prerequisite.centerX - item.centerX,
        prerequisite.centerY - item.centerY,
      )
      : null;
    results.push({
      clicks,
      scrollSteps,
      dragScreens,
      navigationSeconds: clicks * SECONDS_PER_CLICK +
        scrollSteps * SECONDS_PER_SCROLL,
    });

    for (const topicNumber of parents) {
      await setListTopicExpanded(page, topicNumber, false);
    }
  }

  return {
    entry,
    entryScroll: entryTarget,
    results,
    closedCardHeights: topicMeasurements.map((topic) => topic.height),
    rowHeights: [...rowHeights.values()],
  };
}

async function setGraphTopicExpanded(page, topicNumber, expanded, expandedTopics) {
  const currentlyExpanded = expandedTopics.has(topicNumber);
  if (currentlyExpanded === expanded) return false;
  await page.locator('[data-graph-node-id]').evaluateAll((nodes, request) => {
    const label = `T${request.topicNumber}`;
    const node = nodes.find((element) =>
      element.querySelector('button.retro-node span')?.textContent?.trim() === label,
    );
    if (!node) throw new Error(`Could not find GRAPH topic ${label}.`);
    const button = node.querySelector('button.retro-node');
    if (!button) throw new Error(`Could not find the GRAPH toggle for ${label}.`);
    button.click();
  }, { topicNumber, expanded });
  if (expanded) expandedTopics.add(topicNumber);
  else expandedTopics.delete(topicNumber);
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ));

  await page.waitForFunction(({ topicNumber, expanded: target }) => {
    const nodes = [...document.querySelectorAll('[data-graph-node-id]')];
    const exists = nodes.some((element) =>
      (element.querySelector('button.retro-node span')?.textContent?.trim() || '')
        .startsWith(`${topicNumber}.`),
    );
    return exists === target;
  }, { topicNumber, expanded }, { timeout: 5000 });
  return true;
}

async function readGraphLayout(page) {
  return page.locator('[data-graph-node-id]').first().evaluate((node) => {
    let scroller = node.parentElement;
    while (scroller && scroller !== document.body) {
      const style = window.getComputedStyle(scroller);
      if (style.overflowX === 'auto' || style.overflowY === 'auto' ||
          style.overflow === 'auto' || style.overflow === 'scroll') break;
      scroller = scroller.parentElement;
    }
    if (!scroller || scroller === document.body) {
      throw new Error('Could not find the rendered graph scroll container.');
    }

    const scrollRect = scroller.getBoundingClientRect();
    const nodes = [...document.querySelectorAll('[data-graph-node-id]')].flatMap((container, flowIndex) => {
      const button = container.querySelector('button.retro-node');
      const label = button?.querySelector('span')?.textContent?.trim();
      if (!button || !label) return [];
      const rect = button.getBoundingClientRect();
      const left = rect.left - scrollRect.left - scroller.clientLeft + scroller.scrollLeft;
      const top = rect.top - scrollRect.top - scroller.clientTop + scroller.scrollTop;
      return [{
        id: container.dataset.graphNodeId,
        label,
        kind: /^T\d+$/.test(label) ? 'topic' : 'subtopic',
        flowIndex,
        left,
        right: left + rect.width,
        centerX: left + rect.width / 2,
        centerY: top + rect.height / 2,
        top: rect.top + window.scrollY + scroller.scrollTop,
        bottom: rect.bottom + window.scrollY + scroller.scrollTop,
        width: rect.width,
        height: rect.height,
      }];
    });
    const prerequisiteButton = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim().startsWith('Prerequisites'));
    if (!prerequisiteButton) {
      throw new Error('Could not find the rendered Prerequisites button.');
    }
    if (scroller.clientWidth <= 0 || window.innerWidth <= 0 || window.innerHeight <= 0) {
      throw new Error('The rendered graph has an unusable scroll viewport.');
    }
    const prerequisiteRect = prerequisiteButton.getBoundingClientRect();
    return {
      nodes,
      scroller: {
        clientWidth: scroller.clientWidth,
        clientHeight: scroller.clientHeight,
        scrollWidth: scroller.scrollWidth,
        scrollHeight: scroller.scrollHeight,
        maxScrollLeft: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
        maxScrollTop: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
      },
      page: {
        startScroll: window.scrollY,
        maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        viewportHeight: window.innerHeight,
        graphRegionTop: scrollRect.top + window.scrollY,
        graphRegionBottom: scrollRect.bottom + window.scrollY,
        prerequisiteTop: prerequisiteRect.top + window.scrollY,
        prerequisiteBottom: prerequisiteRect.bottom + window.scrollY,
      },
    };
  });
}

function scrollTargetForRange(start, end, viewportSize, maxScroll, currentScroll) {
  const lower = Math.max(0, end - viewportSize);
  const upper = Math.min(start, maxScroll);
  if (lower <= upper) {
    return Math.max(lower, Math.min(upper, currentScroll));
  }
  return Math.max(0, Math.min(maxScroll, currentScroll));
}

function axisRouteSteps(firstStart, firstEnd, secondStart, secondEnd, viewportSize, maxScroll, startScroll) {
  const rangeStart = Math.min(firstStart, secondStart);
  const rangeEnd = Math.max(firstEnd, secondEnd);
  if (rangeEnd - rangeStart <= viewportSize) {
    const target = scrollTargetForRange(
      rangeStart, rangeEnd, viewportSize, maxScroll, startScroll,
    );
    return Math.ceil(Math.abs(target - startScroll) / viewportSize);
  }

  const targetForNode = (start, end) => Math.max(
    0,
    Math.min(maxScroll, (start + end - viewportSize) / 2),
  );
  const firstTarget = targetForNode(firstStart, firstEnd);
  const secondTarget = targetForNode(secondStart, secondEnd);
  const stepsBetween = (from, to) => Math.ceil(Math.abs(to - from) / viewportSize);
  return Math.min(
    stepsBetween(startScroll, firstTarget) + stepsBetween(firstTarget, secondTarget),
    stepsBetween(startScroll, secondTarget) + stepsBetween(secondTarget, firstTarget),
  );
}

function graphPairScrollSteps(first, second, scroller, page) {
  const horizontalSteps = axisRouteSteps(
    first.left,
    first.right,
    second.left,
    second.right,
    scroller.clientWidth,
    scroller.maxScrollLeft,
    0,
  );
  const verticalSteps = axisRouteSteps(
    first.top,
    first.bottom,
    second.top,
    second.bottom,
    page.viewportHeight,
    page.maxScroll,
    page.startScroll,
  );
  return horizontalSteps + verticalSteps;
}

function graphDragDistance(layout, prerequisiteNumber, dependentNumber) {
  const prerequisite = layout.nodes.find((node) => node.label === prerequisiteNumber);
  const dependent = layout.nodes.find((node) => node.label === dependentNumber);
  if (!prerequisite || !dependent) {
    throw new Error(`Could not locate graph drag endpoints ${prerequisiteNumber} and ${dependentNumber}.`);
  }
  if (prerequisite.kind !== 'subtopic' || dependent.kind !== 'subtopic') {
    return null;
  }

  const dependentIndex = layout.nodes.indexOf(dependent);
  const previous = layout.nodes[dependentIndex - 1];
  if (!previous) return null;

  const dropX = (previous.centerX + dependent.centerX) / 2;
  const dropY = (previous.centerY + dependent.centerY) / 2;
  return {
    dx: prerequisite.centerX - dropX,
    dy: prerequisite.centerY - dropY,
  };
}

async function measureGraph(page, violations, topicDetails, repairMovesByViolation) {
  const topicNumbers = topicDetails.map((topic) => topic.number);
  await page.getByRole('button', { name: 'Graph' }).click();
  await page.locator('[data-graph-node-id] button.retro-node').first().waitFor();
  await page.waitForFunction((numbers) => {
    const labels = [...document.querySelectorAll('[data-graph-node-id] button.retro-node span')]
      .map((span) => span.textContent?.trim() || '');
    return numbers.every((number) => labels.includes(`T${number}`));
  }, topicNumbers);

  const initialLabels = await page.locator('[data-graph-node-id] button.retro-node span')
    .evaluateAll((spans) => spans.map((span) => span.textContent?.trim() || ''));
  const expandedTopics = new Set(
    initialLabels
      .filter((label) => /^\d+\.\d+$/.test(label))
      .map((label) => label.split('.')[0]),
  );

  const prerequisiteButton = page.getByRole('button', { name: /Prerequisites/ });
  const initialGraphLayout = await readGraphLayout(page);
  const prerequisiteTarget = scrollTargetForRange(
    initialGraphLayout.page.prerequisiteTop,
    initialGraphLayout.page.prerequisiteBottom,
    VIEWPORT_HEIGHT,
    initialGraphLayout.page.maxScroll,
    initialGraphLayout.page.startScroll,
  );
  const prerequisiteScrollSteps = Math.ceil(
    Math.abs(prerequisiteTarget - initialGraphLayout.page.startScroll) /
      VIEWPORT_HEIGHT,
  );
  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), prerequisiteTarget);
  await prerequisiteButton.click();
  const scroller = page.locator('.retro-hud + main > div.overflow-auto');
  await scroller.waitFor();
  const graphEntryLayout = await readGraphLayout(page);
  const regionTarget = scrollTargetForRange(
    graphEntryLayout.page.graphRegionTop,
    Math.min(
      graphEntryLayout.page.graphRegionBottom,
      graphEntryLayout.page.graphRegionTop + VIEWPORT_HEIGHT,
    ),
    VIEWPORT_HEIGHT,
    graphEntryLayout.page.maxScroll,
    await page.evaluate(() => window.scrollY),
  );
  const regionStartScroll = await page.evaluate(() => window.scrollY);
  const regionScrollSteps = Math.ceil(
    Math.abs(regionTarget - regionStartScroll) / VIEWPORT_HEIGHT,
  );
  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), regionTarget);
  await scroller.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = 0;
  });
  const entry = {
    clicks: 1,
    scrollSteps: prerequisiteScrollSteps + regionScrollSteps,
  };
  const results = [];
  const nodeSizes = new Map();
  for (const violation of violations) {
    const parents = parentTopicsFor(violation);
    let clicks = 0;
    for (const topicNumber of parents) {
      if (await setGraphTopicExpanded(
        page,
        topicNumber,
        true,
        expandedTopics,
      )) clicks += 1;
    }

    const expandedLayout = await readGraphLayout(page);
    for (const node of expandedLayout.nodes) {
      if (!nodeSizes.has(node.id)) {
        nodeSizes.set(node.id, { width: node.width, height: node.height });
      }
    }

    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), regionTarget);
    await scroller.evaluate((element) => {
      element.scrollLeft = 0;
      element.scrollTop = 0;
    });
    const layout = await readGraphLayout(page);
    const prerequisite = layout.nodes.find(
      (node) => node.label === violation.prerequisite.number,
    );
    const item = layout.nodes.find((node) => node.label === violation.item.number);
    if (!prerequisite || !item) {
      throw new Error(`Could not measure graph nodes for "${violation.label}".`);
    }
    const scrollSteps = graphPairScrollSteps(
      prerequisite,
      item,
      layout.scroller,
      layout.page,
    );
    const repairMove = repairMovesByViolation.get(violationKey(violation));
    const dragVector = repairMove?.isTarget
      ? graphDragDistance(
        layout,
        violation.prerequisite.number,
        violation.item.number,
      )
      : null;
    const dragScreens = dragVector
      ? viewportScreens(dragVector.dx, dragVector.dy)
      : null;
    results.push({
      clicks,
      scrollSteps,
      dragScreens,
      navigationSeconds: clicks * SECONDS_PER_CLICK + scrollSteps * SECONDS_PER_SCROLL,
    });

    for (const topicNumber of parents) {
      await setGraphTopicExpanded(
        page,
        topicNumber,
        false,
        expandedTopics,
      );
    }
  }

  return {
    entry,
    results,
    nodeSizes: [...nodeSizes.values()],
  };
}

function formatPixels(values) {
  const rounded = values.map((value) => Number(value.toFixed(1)));
  const min = Math.min(...rounded);
  const max = Math.max(...rounded);
  return min === max ? `${min}` : `${min}-${max}`;
}

function printReport(violations, list, graph, repairMoves) {
  const violationRows = violations.map((violation, index) => {
    const move = repairMoves.byViolation.get(violationKey(violation));
    return {
      violation: violation.label,
      move: move.isTarget ? move.id : `${move.id} (shared)`,
      listClicks: move.isTarget ? list.results[index].clicks : '-',
      listScroll: move.isTarget ? list.results[index].scrollSteps : '-',
      listNavSeconds: move.isTarget ? list.results[index].navigationSeconds : '-',
      listDragScreens: move.isTarget ? list.results[index].dragScreens ?? '-' : '-',
      graphClicks: move.isTarget ? graph.results[index].clicks : '-',
      graphScroll: move.isTarget ? graph.results[index].scrollSteps : '-',
      graphNavSeconds: move.isTarget ? graph.results[index].navigationSeconds : '-',
      graphDragScreens: move.isTarget ? graph.results[index].dragScreens ?? '-' : '-',
    };
  });
  const moveResults = repairMoves.moves.map((move) => {
    const index = violations.findIndex((violation) =>
      violationKey(violation) === violationKey(move.target),
    );
    return { list: list.results[index], graph: graph.results[index] };
  });
  const sumMoveMetric = (view, metric) => moveResults.reduce(
    (sum, result) => sum + result[view][metric],
    0,
  );
  const listClicks = list.entry.clicks + sumMoveMetric('list', 'clicks');
  const listScroll = list.entry.scrollSteps + sumMoveMetric('list', 'scrollSteps');
  const graphClicks = graph.entry.clicks + sumMoveMetric('graph', 'clicks');
  const graphScroll = graph.entry.scrollSteps + sumMoveMetric('graph', 'scrollSteps');
  const rows = [...violationRows, {
    violation: 'TOTAL (entry + moves)',
    move: `${repairMoves.moves.length} unique moves`,
    listClicks,
    listScroll,
    listNavSeconds: listClicks * SECONDS_PER_CLICK + listScroll * SECONDS_PER_SCROLL,
    listDragScreens: repairMoves.moves.every((move) =>
      typeof list.results.find((result, index) =>
        violationKey(violations[index]) === violationKey(move.target),
      )?.dragScreens === 'number',
    )
      ? repairMoves.moves.reduce((sum, move) => {
        const index = violations.findIndex((violation) =>
          violationKey(violation) === violationKey(move.target),
        );
        return sum + list.results[index].dragScreens;
      }, 0)
      : '-',
    graphClicks,
    graphScroll,
    graphNavSeconds: graphClicks * SECONDS_PER_CLICK + graphScroll * SECONDS_PER_SCROLL,
    graphDragScreens: repairMoves.moves.every((move) => {
      const index = violations.findIndex((violation) =>
        violationKey(violation) === violationKey(move.target),
      );
      return typeof graph.results[index]?.dragScreens === 'number';
    })
      ? repairMoves.moves.reduce((sum, move) => {
        const index = violations.findIndex((violation) =>
          violationKey(violation) === violationKey(move.target),
        );
        return sum + graph.results[index].dragScreens;
      }, 0)
      : '-',
  }];

  const headers = [
    'violation',
    'repair move',
    'list clicks', 'list scroll screens', 'list nav sec', 'list drag screens',
    'graph clicks', 'graph scroll screens', 'graph nav sec', 'graph drag screens',
  ];
  const fields = [
    'violation',
    'move',
    'listClicks', 'listScroll', 'listNavSeconds', 'listDragScreens',
    'graphClicks', 'graphScroll', 'graphNavSeconds', 'graphDragScreens',
  ];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[fields[index]]).length)),
  );
  const line = (values) => values
    .map((value, index) => String(value).padEnd(widths[index]))
    .join(' | ');
  console.log(line(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('-+-'));
  for (const row of rows) {
    console.log(line(fields.map((field) =>
      typeof row[field] === 'number' && field.endsWith('Seconds')
        ? row[field].toFixed(1)
        : typeof row[field] === 'number' &&
            (field === 'graphDragScreens' || field === 'listDragScreens')
          ? row[field].toFixed(2)
        : row[field],
    )));
  }

  console.log(`closed topic card height: ${formatPixels(list.closedCardHeights)} px (range across ${list.closedCardHeights.length} cards)`);
  console.log(`subtopic row height: ${formatPixels(list.rowHeights)} px (range across ${list.rowHeights.length} measured rows)`);
  const nodeWidths = graph.nodeSizes.map((node) => node.width);
  const nodeHeights = graph.nodeSizes.map((node) => node.height);
  console.log(`graph node size: ${formatPixels(nodeWidths)} x ${formatPixels(nodeHeights)} px (range across ${graph.nodeSizes.length} nodes)`);
  console.log(`repair moves: ${repairMoves.moves.length}; repeated prerequisite links share a single move to the earliest dependent`);
  const listEntrySeconds = list.entry.clicks * SECONDS_PER_CLICK +
    list.entry.scrollSteps * SECONDS_PER_SCROLL;
  const graphEntrySeconds = graph.entry.clicks * SECONDS_PER_CLICK +
    graph.entry.scrollSteps * SECONDS_PER_SCROLL;
  console.log(`list entry: ${list.entry.clicks} clicks + ${list.entry.scrollSteps} scroll screens = ${listEntrySeconds.toFixed(1)} s (counted in totals)`);
  console.log(`graph entry: ${graph.entry.clicks} clicks + ${graph.entry.scrollSteps} scroll screens = ${graphEntrySeconds.toFixed(1)} s (counted in totals)`);
  console.log(`drag screens use the larger of horizontal distance / ${VIEWPORT_WIDTH} and vertical distance / ${VIEWPORT_HEIGHT}; drag time and thinking time are excluded`);
  console.log('D3 assumption: Start logged in, NODES tab open, view selected, page scrollY=0, all topics closed, Prerequisites not clicked.');
  console.log('D6 assumption: Start each violation at Pe; open only its parent topics (count closed-to-open clicks), read fresh positions, route vertical plus graph horizontal screens, then close parents without counting reset.');
  console.log('D6 nav seconds are derived as clicks * 1.2 s + scroll screens * 1.5 s.');
  console.log('D8 assumption: Drag the prerequisite before its earliest dependent as a simple reposition; moves are not executed.');
}

async function main() {
  const { email, password, courseId } = requireEnvironment();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    });
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Log In' }).click();
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });

    await page.goto(`${APP_URL}/prof/course/${encodeURIComponent(courseId)}`, {
      waitUntil: 'domcontentloaded',
    });
    try {
      const nodesTab = page.getByRole('button', { name: 'NODES', exact: true });
      await nodesTab.waitFor({ state: 'visible', timeout: 30000 });

      const gotItButton = page.getByRole('button', { name: 'GOT IT', exact: true });
      if (await gotItButton.isVisible()) {
        await gotItButton.click();
        await page.waitForTimeout(500);
      }

      await nodesTab.click();
      await page.getByRole('heading', { name: 'Curriculum Nodes', exact: true })
        .waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForFunction(() => {
        const listButton = [...document.querySelectorAll('button')]
          .find((button) => button.textContent?.trim() === 'List');
        return !!listButton && listButton.classList.contains('bg-blue-600');
      }, null, { timeout: 30000 });
    } catch (error) {
      console.error(`Nodes/list view wait failed; page.url(): ${page.url()}`);
      await page.screenshot({ path: join(SCRIPT_DIRECTORY, 'course-debug.png') });
      throw error;
    }

    const violations = await renderedListViolations(page);
    if (!violations.length) {
      console.log('No violations');
      return;
    }
    const topicMeasurements = await getListTopicMeasurements(page);
    if (!topicMeasurements.length) {
      throw new Error('Could not measure any rendered closed LIST topic cards.');
    }
    const repairMoves = buildRepairMoves(violations);
    const list = await measureList(
      page,
      violations,
      topicMeasurements,
      repairMoves.byViolation,
    );
    const graph = await measureGraph(
      page,
      violations,
      topicMeasurements,
      repairMoves.byViolation,
    );
    printReport(violations, list, graph, repairMoves);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Measurement failed: ${error.message}`);
  process.exitCode = 1;
});
