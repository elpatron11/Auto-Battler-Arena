import { useEffect, useState } from 'react';
import { getListArenaOpponentRecordsQueryKey, useListArenaOpponentRecords } from '@workspace/api-client-react';
import { Pager } from './Pager';
import { paginate } from '../lib/pagination';
import { QueryState } from './QueryState';

export function ArenaHeadToHead({teamSize=3}:{teamSize?:2|3}) {
  // Defenses can be settled by another player's session while this screen is open.
  const records = useListArenaOpponentRecords({teamSize},{query:{queryKey:getListArenaOpponentRecordsQueryKey({teamSize}),refetchInterval:30_000,refetchOnWindowFocus:'always'}});
  const [page, setPage] = useState(1);
  const items = records.data ?? [];
  const view = paginate(items, page);
  useEffect(() => { if (view.page !== page) setPage(view.page); }, [view.page, page]);

  return <div className="ag-head-to-head" data-testid="arena-head-to-head">
    <h3>Head-to-head</h3>
    <p className="ag-hint">Your record against each opponent · all completed arena matches, grouped by opponent</p>
    {records.isLoading ? <QueryState label="Loading head-to-head records"/> :
      records.isError ? <QueryState error retry={() => records.refetch()}/> :
      !items.length ? <p className="ag-h2h-empty">Complete an arena fight to see your record against that opponent.</p> :
      <>
        <div className="ag-h2h-list">
          {view.items.map(item =>
            <div className="ag-h2h-row" key={item.opponentId} data-testid={`arena-record-${item.opponentId}`}>
              <strong>vs {item.opponentName}</strong>
              <span>{item.wins}–{item.losses}{item.draws ? `–${item.draws}` : ''} <small>· {item.totalGames} {item.totalGames === 1 ? 'game' : 'games'} ·</small> {item.winRate}%</span>
            </div>)}
        </div>
        <Pager page={view.page} pages={view.pages} total={view.total} label="Head-to-head" onPage={setPage} testId="h2h"/>
        {items.some(item => item.draws > 0) && <p className="ag-h2h-note">Records with a third number include draws. Win rate is wins ÷ total games.</p>}
      </>}
  </div>;
}