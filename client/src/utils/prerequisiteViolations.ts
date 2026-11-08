import { cleanTitle } from './cleanTitle';

export interface Violation {
  itemId: string;
  prerequisiteId: string;
  itemNumber: string;
  itemName: string;
  prerequisiteNumber: string;
  prerequisiteName: string;
}

// position = (topic index, 0) for a topic, (topic index, subtopic index + 1) for a subtopic
export function findViolations(topics: any[]): Violation[] {
  const pos = new Map<string, [number, number]>();
  const display = new Map<string, { number: string; name: string }>();
  const sorted = [...topics].sort((a, b) => a.order - b.order);
  sorted.forEach((t, ti) => {
    pos.set(t.id, [ti, 0]);
    display.set(t.id, { number: `${ti + 1}`, name: cleanTitle(t.name || t.title) });
    [...(t.subtopics ?? [])]
      .sort((a: any, b: any) => a.order - b.order)
      .forEach((s: any, si: number) => {
        pos.set(s.id, [ti, si + 1]);
        display.set(s.id, {
          number: `${ti + 1}.${si + 1}`,
          name: cleanTitle(s.name || s.title),
        });
      });
  });

  const isBefore = (a: [number, number], b: [number, number]) =>
    a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

  const result: Violation[] = [];
  const check = (item: any) => {
    const me = pos.get(item.id);
    for (const p of item.prerequisites ?? []) {
      const other = pos.get(p.id);
      if (me && other && !isBefore(other, me)) {
        const itemDisplay = display.get(item.id);
        const prerequisiteDisplay = display.get(p.id);
        if (itemDisplay && prerequisiteDisplay) {
          result.push({
            itemId: item.id,
            prerequisiteId: p.id,
            itemNumber: itemDisplay.number,
            itemName: itemDisplay.name,
            prerequisiteNumber: prerequisiteDisplay.number,
            prerequisiteName: prerequisiteDisplay.name,
          });
        }
      }
    }
  };
  sorted.forEach((t) => {
    check(t);
    (t.subtopics ?? []).forEach(check);
  });
  return result;
}

export function violationText(violation: Violation): string {
  return `"${violation.itemNumber} ${violation.itemName}" needs ` +
    `"${violation.prerequisiteNumber} ${violation.prerequisiteName}", but ` +
    `${violation.prerequisiteNumber} comes later.`;
}