"use client";

import { ShapeIcon, SHAPE_META } from "./ShapeIcon";

export function CardShape({ type, size = "md" }) {
  const meta = SHAPE_META[type] || SHAPE_META.square;
  const sizes = { sm: 24, md: 48, lg: 80 };
  const px = sizes[size] || 48;
  const iconPx = Math.round(px * 0.68);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        style={{
          width: px,
          height: px,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `2px solid ${meta.color}`,
          borderRadius: 4,
          background: `${meta.color}11`,
          boxShadow: `0 0 16px ${meta.color}33`,
        }}
      >
        <ShapeIcon shape={type} size={iconPx} />
      </div>
      {size !== "sm" && (
        <span
          style={{
            color: meta.color,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {meta.label}
        </span>
      )}
    </div>
  );
}

// Convenience export for components that need the shape key list
export const SHAPES = ["circle", "triangle", "cross", "square", "star"];
