import type { ReactNode } from "react";

interface SectionTitleProps {
  children: ReactNode;
  right?: ReactNode;
}

export function SectionTitle({ children, right }: SectionTitleProps) {
  return (
    <div className="section-h">
      <span className="section-t">{children}</span>
      {right && <span className="section-r">{right}</span>}
    </div>
  );
}
