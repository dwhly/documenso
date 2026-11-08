import { Button } from '@documenso/ui/primitives/button';
import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type FleetTableFooterProps<TData> = {
  table: Table<TData>;
  /** Total rows across all pages (server count). */
  total?: number;
};

/**
 * List-table footer (shell spec §7, same as Send): "Showing 1–10 of 47" at left and a pager at right,
 * the pager only when there is more than one page. No rows-per-page control.
 */
export function FleetTableFooter<TData>({ table, total }: FleetTableFooterProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const rows = table.getRowModel().rows.length;
  const count = total ?? rows;
  const pageCount = Math.max(table.getPageCount(), 1);

  if (count === 0) {
    return null;
  }

  const from = pageIndex * pageSize + 1;
  const to = Math.min(pageIndex * pageSize + rows, count);

  return (
    <div className="fleet-table-footer">
      <span className="fds-num" data-testid="data-table-count">
        {`Showing ${from}\u2013${to} of ${count}`}
      </span>

      {pageCount > 1 && (
        <div className="fleet-table-footer__pager">
          <span className="fds-num">{`Page ${pageIndex + 1} of ${pageCount}`}</span>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
