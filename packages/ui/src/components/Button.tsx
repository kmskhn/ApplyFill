import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`af-btn af-btn-${variant} af-btn-${size} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="af-btn-spinner" aria-label="Loading">
          ⏳
        </span>
      ) : (
        children
      )}
    </button>
  );
}
