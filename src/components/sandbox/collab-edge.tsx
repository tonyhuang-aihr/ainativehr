"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";

export type CollabEdgeData = { score: number };

export function CollabEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<CollabEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  const score = data?.score ?? 0;
  const width = score >= 70 ? 10 : score >= 45 ? 6 : 3.5;
  return (
    <>
      <BaseEdge path={path} style={{ stroke: "#8B5CF6", strokeWidth: width, strokeDasharray: "7 5" }} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan rounded-full border border-[#DDD6FE] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#6D28D9]"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
        >
          {score}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
