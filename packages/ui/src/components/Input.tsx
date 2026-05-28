import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, id, className = "", ...props }: InputProps) {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="af-input-group">
      <label htmlFor={inputId} className="af-label">
        {label}
      </label>
      <input id={inputId} className={`af-input ${error ? "af-input-error" : ""} ${className}`} {...props} />
      {error && <span className="af-error-text">{error}</span>}
    </div>
  );
}
