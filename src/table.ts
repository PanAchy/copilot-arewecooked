export interface Column<T> {
  header: string;
  value: (row: T) => string;
  align?: "left" | "right";
}

export function renderTable<T>(rows: T[], columns: Array<Column<T>>): string[] {
  const renderedRows = rows.map((row) =>
    columns.map((column) => column.value(row))
  );
  const widths = columns.map((column, index) =>
    Math.max(
      column.header.length,
      ...renderedRows.map((row) => row[index].length)
    )
  );

  const renderCells = (cells: string[]) =>
    cells
      .map((cell, index) => {
        const column = columns[index];
        return column.align === "right"
          ? cell.padStart(widths[index])
          : cell.padEnd(widths[index]);
      })
      .join("  ");

  return [
    renderCells(columns.map((column) => column.header)),
    renderCells(widths.map((width) => "-".repeat(width))),
    ...renderedRows.map(renderCells),
  ];
}
