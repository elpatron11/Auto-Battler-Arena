import { ArrowLeft, ArrowRight } from 'lucide-react';
export function Pager({page, pages, total, label, onPage, testId}: {page:number;pages:number;total:number;label:string;onPage:(page:number)=>void;testId:string}) {
  if (total === 0) return null;
  return <nav className="pager" aria-label={`${label} pages`} data-testid={`pager-${testId}`}>
    <button type="button" className="pager-btn" disabled={page<=1} onClick={()=>onPage(page-1)} data-testid={`button-${testId}-prev`}><ArrowLeft size={12}/> Previous</button>
    <span className="pager-idx" data-testid={`text-${testId}-page`}>Page {page} of {pages}</span>
    <button type="button" className="pager-btn" disabled={page>=pages} onClick={()=>onPage(page+1)} data-testid={`button-${testId}-next`}>Next <ArrowRight size={12}/></button>
  </nav>;
}
