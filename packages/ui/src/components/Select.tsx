import React from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
}

export function Select({ label, options, error, id, className = "", ...props }: SelectProps) {
  const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="af-input-group">
      <label htmlFor={selectId} className="af-label">
        {label}
      </label>
      <select id={selectId} className={`af-select ${error ? "af-input-error" : ""} ${className}`} {...props}>
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="af-error-text">{error}</span>}
    </div>
  );
}
