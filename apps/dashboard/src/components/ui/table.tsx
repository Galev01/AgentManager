import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  Key,
} from "react";
import { LoadingRow } from "./loading-row";

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

/** Column descriptor for `DataTable<T>`. */
export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  width?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => Key;
  emptyState?: ReactNode;
  loading?: boolean;
  className?: string;
}

/**
 * Generic declarative table. Spec-aligned primitive for Task 31.
 *
 * - While `loading`, renders 3 skeleton rows.
 * - When `rows` is empty and not loading, renders `emptyState` (or inline fallback).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyState,
  loading,
  className,
}: DataTableProps<T>) {
  const colSpan = columns.length;

  return (
    <table className={["tbl", className].filter(Boolean).join(" ")}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} style={col.width ? { width: col.width } : undefined}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <LoadingRow colSpan={colSpan} rows={3} />
        ) : rows.length === 0 ? (
          <tr>
            <td
              colSpan={colSpan}
              style={{
                padding: 0,
                borderBottom: "none",
                background: "transparent",
              }}
            >
              {emptyState ?? (
                <div
                  style={{
                    padding: "32px 14px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 12.5,
                  }}
                >
                  No data
                </div>
              )}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
