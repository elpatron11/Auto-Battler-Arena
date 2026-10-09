import { AlertTriangle, RotateCcw } from 'lucide-react';

export function QueryState({ error, retry, label = 'Loading the arena' }: { error?: boolean; retry?: () => void; label?: string }) {
  if (error) return <div className="panel empty" role="alert" data-testid="status-error"><AlertTriangle size={28} style={{ margin:'0 auto 14px', color:'#f0a9a6' }}/><strong>The signal was lost</strong><p>We could not reach the arena. Your squad is still safe.</p><button className="btn btn-sm" onClick={retry} data-testid="button-retry"><RotateCcw size={14}/> Try again</button></div>;
  return <div className="panel" aria-label={label} data-testid="status-loading" style={{ padding:24 }}><div className="skeleton" style={{ width:130,height:12,marginBottom:22 }}/><div className="skeleton" style={{ width:'70%',height:36,marginBottom:20 }}/><div className="skeleton" style={{ width:'95%',height:46,marginBottom:10 }}/><div className="skeleton" style={{ width:'84%',height:46 }}/></div>;
}