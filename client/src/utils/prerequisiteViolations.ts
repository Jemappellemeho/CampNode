export interface Violation {
  itemId: string;
  prerequisiteId: string;
}

// position = (topic index, 0) for a topic, (topic index, subtopic index + 1) for a subtopic
export function findViolations(topics: any[]): Violation[] {
  const pos = new Map<string, [number, number]>();
  const sorted = [...topics].sort((a, b) => a.order - b.order);
  sorted.forEach((t, ti) => {
    pos.set(t.id, [ti, 0]);
    [...(t.subtopics ?? [])]
      .sort((a: any, b: any) => a.order - b.order)
      .forEach((s: any, si: number) => pos.set(s.id, [ti, si + 1]));
  });

  const isBefore = (a: [number, number], b: [number, number]) =>
    a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

  const result: Violation[] = [];
  const check = (item: any) => {
    const me = pos.get(item.id);
    for (const p of item.prerequisites ?? []) {
      const other = pos.get(p.id);
      if (me && other && !isBefore(other, me)) {
        result.push({ itemId: item.id, prerequisiteId: p.id });
      }
    }
  };
  sorted.forEach((t) => {
    check(t);
    (t.subtopics ?? []).forEach(check);
  });
  return result;
}