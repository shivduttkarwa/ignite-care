import type { ReactNode } from "react";

import { Icon } from "../Icons";

type Props = {
  id: string;
  title: string;
  counts?: { filled: number; total: number };
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  accent?: boolean;
  children: ReactNode;
};

export function FormSection({
  id,
  title,
  counts,
  collapsible = false,
  open = true,
  onToggle,
  accent,
  children,
}: Props) {
  const done = counts ? counts.total > 0 && counts.filled === counts.total : false;

  return (
    <section className={`c-section${accent ? " c-section--accent" : ""}`}>
      {collapsible ? (
        <button
          type="button"
          className="c-section__toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
        >
          <span className="c-section__title">{title}</span>
          {counts && (
            <span className={`c-section__count${done ? " c-section__count--done" : ""}`}>
              {counts.filled} of {counts.total} answered
            </span>
          )}
          <Icon name="chevron-down" className="c-section__chevron" />
        </button>
      ) : (
        <h2 className="c-section__head c-section__title">{title}</h2>
      )}
      {(open || !collapsible) && (
        <div className="c-section__body" id={id}>
          {children}
        </div>
      )}
    </section>
  );
}
