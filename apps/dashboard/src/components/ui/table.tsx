import type { HTMLAttributes, ReactNode, TableHTMLAttributes } from "react";

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

export function Table({ className, children, ...rest }: TableProps) {
  return (
    <table className={["tbl", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </table>
  );
}

interface TableWrapProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function TableWrap({ className, children, ...rest }: TableWrapProps) {
  return (
    <div
      className={["card", className].filter(Boolean).join(" ")}
      style={{ overflow: "hidden", ...rest.style }}
      {...rest}
    >
      {children}
    </div>
  );
}
