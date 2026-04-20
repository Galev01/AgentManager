interface LoadingRowProps {
  colSpan: number;
  rows?: number;
}

export function LoadingRow({ colSpan, rows = 3 }: LoadingRowProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="skel-row">
          <td colSpan={colSpan}>
            <div className="skel" />
          </td>
        </tr>
      ))}
    </>
  );
}
