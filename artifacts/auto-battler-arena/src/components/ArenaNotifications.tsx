import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, X } from 'lucide-react';
import { Link } from 'wouter';
import { getListArenaNotificationsQueryKey, useListArenaNotifications, useMarkArenaNotificationsRead } from '@workspace/api-client-react';
import type { ArenaNotification } from '@workspace/api-client-react';
import './arena-social.css';

function itemName(value:string) { return value.replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }
function economyLine(note:ArenaNotification) {
  const parts = [`${note.economy.gold >= 0 ? '+' : '−'}${Math.abs(note.economy.gold).toLocaleString()} Gold`];
  for (const drop of note.economy.drops) parts.push(`${drop.duplicate?'Duplicate ':'+'}${itemName(drop.itemId)} (${drop.kind})`);
  for (const loss of note.economy.losses) parts.push(`Lost ${itemName(loss.itemId)} (${loss.kind})${loss.listingCancelled?' · listing cancelled':''}`);
  return parts.join(' · ');
}

export function ArenaNotifications({openRequested=0,onUnreadChange,autoOpen=true}:{openRequested?:number;onUnreadChange?:(count:number)=>void;autoOpen?:boolean}) {
  const client = useQueryClient();
  const notifications = useListArenaNotifications({query:{queryKey:getListArenaNotificationsQueryKey(),refetchInterval:30_000,refetchOnWindowFocus:true}});
  const markRead = useMarkArenaNotificationsRead();
  const [open,setOpen] = useState(false);
  const [seen,setSeen] = useState<string[]>([]);
  const [error,setError] = useState('');
  const initiallyShown = useRef(false);
  const items = notifications.data ?? [];
  useEffect(()=>{onUnreadChange?.(items.length);},[items.length,onUnreadChange]);
  useEffect(()=>{if(openRequested>0)setOpen(true);},[openRequested]);
  useEffect(()=>{
    if (!notifications.isLoading && !initiallyShown.current) {
      initiallyShown.current = true;
      if (items.length && autoOpen) setOpen(true);
    }
  },[notifications.isLoading,notifications.data]);
  useEffect(()=>{
    if (!open || document.visibilityState !== 'visible' || !items.length) return;
    setSeen(previous=>Array.from(new Set([...previous,...items.map(item=>item.id)])));
  },[open,notifications.data]);
  useEffect(()=>{
    const onVisible = () => {
      if (open && document.visibilityState === 'visible') {
        setSeen(previous=>Array.from(new Set([...previous,...items.map(item=>item.id)])));
      }
    };
    document.addEventListener('visibilitychange',onVisible);
    return ()=>document.removeEventListener('visibilitychange',onVisible);
  },[open,notifications.data]);
  const dismiss = (ids:string[]) => {
    const visibleIds = ids.filter(id=>seen.includes(id) && items.some(item=>item.id===id));
    if (!visibleIds.length) return;
    setError('');
    markRead.mutate({data:{ids:visibleIds}},{
      onSuccess:()=>{setSeen(previous=>previous.filter(id=>!visibleIds.includes(id)));void client.invalidateQueries({queryKey:getListArenaNotificationsQueryKey()});},
      onError:()=>setError('Could not dismiss results. Please try again.')
    });
  };
  return <div className="arena-social">
    <button type="button" className="navlink social-notice-trigger" onClick={()=>setOpen(value=>!value)} aria-expanded={open} aria-label={`Arena results, ${items.length} unread`} data-testid="button-arena-notifications">
      <Bell size={15}/> <span>Notifications</span>{items.length>0 && <span className="social-notice-count" data-testid="text-unread-results">{items.length}</span>}
    </button>
    {open && <section className="social-notice-panel" aria-label="Unread Arena results" data-testid="panel-arena-notifications">
       <div className="social-notice-head"><div><span className="social-kicker">Account updates</span><h2 className="social-heading">Notifications</h2></div><button className="social-button subtle" onClick={()=>setOpen(false)} aria-label="Close results" data-testid="button-close-notifications"><X size={15}/></button></div>
      {notifications.isLoading ? <><div className="social-skeleton"/><div className="social-skeleton"/></>
        : notifications.isError ? <div className="social-message error" role="alert">Results are unavailable. <button className="social-button subtle" onClick={()=>void notifications.refetch()} data-testid="button-retry-notifications">Try again</button></div>
        : !items.length ? <div className="social-empty" data-testid="status-no-notifications"><strong>All caught up</strong>New battle results will appear here when you return.</div>
        : <><div className="social-notice-list">{items.map(note=><article className="social-notice" key={note.id} data-testid={`card-notification-${note.id}`}>
          <div className="social-notice-title"><span>{note.type==='tournament' ? 'Tournament squad victory' : `${note.outcome==='win'?'Defense victory':note.outcome==='loss'?'Defense defeat':'Defense draw'} vs`} {note.type!=='tournament' && <Link href={`/arena/profiles/${encodeURIComponent(note.opponentId)}`} onClick={()=>setOpen(false)} data-testid={`link-notification-opponent-${note.id}`}>{note.opponentName}</Link>}</span>{note.type!=='tournament' && <span className="social-delta">{note.ratingDelta>=0?'+':''}{note.ratingDelta} RP</span>}</div>
          <p>{note.message || 'Your saved Arena defense was challenged.'} <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time></p>
          <p className="social-notice-rewards" data-testid={`text-notification-economy-${note.id}`}>{economyLine(note)}</p>
          <div className="social-notice-actions"><Link href="/arena" onClick={()=>setOpen(false)} data-testid={`link-notification-arena-${note.id}`}>Battle record</Link><button className="social-button subtle" disabled={markRead.isPending || !seen.includes(note.id)} onClick={()=>dismiss([note.id])} data-testid={`button-dismiss-notification-${note.id}`}>Dismiss</button></div>
        </article>)}</div><div style={{marginTop:12,textAlign:'right'}}><button className="social-button gold" disabled={markRead.isPending || !items.some(item=>seen.includes(item.id))} onClick={()=>dismiss(items.map(item=>item.id))} data-testid="button-dismiss-seen-notifications">Dismiss seen results</button></div></>}
      {error && <p className="social-message error" role="alert" data-testid="status-notification-error">{error}</p>}
    </section>}
  </div>;
}