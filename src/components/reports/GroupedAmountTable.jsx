import { Fragment } from 'react';
import { formatCurrency, formatPercent } from '../../lib/format';
import { EmptyState } from '../ui';

export const shareOf = (part, total) => (total > 0 ? (part / total) * 100 : NaN);

/** Group rows with indented item rows below; shares are relative to `total`. */
export default function GroupedAmountTable({ groups, total, totalLabel, tone, emptyMessage }) {
  if (groups.length === 0) return <EmptyState>{emptyMessage}</EmptyState>;

  return (
    <div className="table-scroll">
      <table className="data-table data-table--compact grouped-table">
        <thead>
          <tr>
            <th>Grup / Kalem</th>
            <th className="text-end">Tutar</th>
            <th className="text-end">Pay</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.name}>
              <tr className="grouped-table__group">
                <td>
                  {group.name}
                  <div className="share-bar">
                    <span style={{ width: `${shareOf(group.amount, total) || 0}%` }} />
                  </div>
                </td>
                <td className="text-end">{formatCurrency(group.amount)}</td>
                <td className="text-end">{formatPercent(shareOf(group.amount, total))}</td>
              </tr>
              {group.items.map((item) => (
                <tr key={item.name} className="grouped-table__item">
                  <td>{item.name}</td>
                  <td className="text-end">{formatCurrency(item.amount)}</td>
                  <td className="text-end text-muted">{formatPercent(shareOf(item.amount, total))}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{totalLabel}</td>
            <td className={`text-end text-${tone}`}>{formatCurrency(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
