import React from "react";

interface StatusBadgeProps {
  status: "idle" | "saving" | "saved";
}

/**
 * Small indicator showing auto-save status.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === "idle") return null;

  return (
    <span
      className={`af-saved-indicator ${status === "saved" ? "af-saved-indicator-visible" : ""}`}
    >
      {status === "saving" ? "💾 Saving..." : "✓ Saved"}
    </span>
  );
}
