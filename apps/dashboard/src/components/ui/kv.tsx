import { Fragment, type ReactNode } from "react";

export interface KVItem {
  label: string;
  value: ReactNode;
}

interface KVProps {
  items: KVItem[];
}

export function KV({ items }: KVProps) {
  return (
    <dl className="kv">
      {items.map((item) => (
        <Fragment key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
