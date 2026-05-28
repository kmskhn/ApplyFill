import React from "react";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function Card({
  title,
  children,
  className = "",
  collapsible = false,
  defaultOpen = true,
}: CardProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className={`af-card ${className}`}>
      {title && (
        <div
          className={`af-card-header ${collapsible ? "af-card-header-collapsible" : ""}`}
          onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}
          role={collapsible ? "button" : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={
            collapsible
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") setIsOpen(!isOpen);
                }
              : undefined
          }
        >
          <h3 className="af-card-title">{title}</h3>
          {collapsible && (
            <span className={`af-card-chevron ${isOpen ? "af-card-chevron-open" : ""}`}>
              ▸
            </span>
          )}
        </div>
      )}
      {(!collapsible || isOpen) && <div className="af-card-body">{children}</div>}
    </div>
  );
}
