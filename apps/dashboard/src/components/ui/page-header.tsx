import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  /** Preferred prop name (spec). */
  description?: ReactNode;
  /** Legacy alias — used by existing consumers. */
  sub?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}

export function PageHeader({
  title,
  description,
  sub,
  actions,
  breadcrumb,
}: PageHeaderProps) {
  const desc = description ?? sub;
  return (
    <div className="page-h">
      <div>
        {breadcrumb && (
          <div className="hd-crumb" style={{ marginBottom: 6 }}>
            {breadcrumb}
          </div>
        )}
        <h1 className="page-title" style={{ margin: 0 }}>
          {title}
        </h1>
        {desc && <div className="page-sub">{desc}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
