import type { Department } from "@/lib/model/types";

export const NODE_W = 252;
export const NODE_H = 118;

const GAP_X = 36;
const GAP_Y = 84;

export type LayoutBox = {
  id: string;
  x: number;
  y: number;
};

export function layoutDepartments(departments: Department[], collapsed: Set<string>): LayoutBox[] {
  const byId = new Map(departments.map((department) => [department.id, department]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const department of departments) {
    if (department.parentId && byId.has(department.parentId)) {
      const list = children.get(department.parentId) ?? [];
      list.push(department.id);
      children.set(department.parentId, list);
    } else {
      roots.push(department.id);
    }
  }
  for (const list of children.values()) {
    list.sort((a, b) => (byId.get(a)?.name ?? "").localeCompare(byId.get(b)?.name ?? "", "zh-CN"));
  }
  roots.sort((a, b) => (byId.get(a)?.name ?? "").localeCompare(byId.get(b)?.name ?? "", "zh-CN"));

  const widthCache = new Map<string, number>();
  const widthOf = (id: string): number => {
    const cached = widthCache.get(id);
    if (cached != null) return cached;
    const kids = collapsed.has(id) ? [] : (children.get(id) ?? []);
    const width =
      kids.length === 0
        ? NODE_W
        : Math.max(NODE_W, kids.reduce((sum, kid) => sum + widthOf(kid), 0) + GAP_X * (kids.length - 1));
    widthCache.set(id, width);
    return width;
  };

  const boxes: LayoutBox[] = [];
  const place = (id: string, left: number, depth: number) => {
    const width = widthOf(id);
    boxes.push({ id, x: left + (width - NODE_W) / 2, y: depth * (NODE_H + GAP_Y) });
    if (collapsed.has(id)) return;
    let cursor = left;
    for (const kid of children.get(id) ?? []) {
      place(kid, cursor, depth + 1);
      cursor += widthOf(kid) + GAP_X;
    }
  };

  let cursor = 0;
  for (const root of roots) {
    place(root, cursor, 0);
    cursor += widthOf(root) + GAP_X * 2;
  }
  return boxes;
}

export function childIds(departments: Department[], id: string): string[] {
  return departments.filter((department) => department.parentId === id).map((department) => department.id);
}
