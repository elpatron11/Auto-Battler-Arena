import {useEffect,useRef,useState} from 'react';

export function VideoShare({url,id,extension}:{url:string;id:string;extension:string}){
  const [file,setFile]=useState<{url:string;value:File}|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[url]);
  const share=async()=>{
    setMessage('');
    let ready=file?.url===url?file.value:null;
    if(!ready){
      setBusy(true);abort.current=new AbortController();
      try{
        const response=await fetch(url,{credentials:'include',signal:abort.current.signal});
        if(!response.ok)throw new Error('The recording is no longer available.');
        const blob=await response.blob();
        ready=new File([blob],`arena-fight-${id}.${extension}`,{type:blob.type||`video/${extension}`});
        setFile({url,value:ready});
      }catch(error){
        if(!abort.current?.signal.aborted)setMessage(error instanceof Error?error.message:'Could not prepare the video.');
        return;
      }finally{setBusy(false);}
    }
    if(navigator.share&&navigator.canShare?.({files:[ready]})){
      try{await navigator.share({files:[ready],title:'Fantasy World Arenas fight'});}
      catch(error){
        if(error instanceof DOMException&&error.name==='AbortError')return;
        setMessage('Video ready. Tap Share video again to open your sharing apps.');
      }
    }else{
      const objectUrl=URL.createObjectURL(ready);
      const link=document.createElement('a');link.href=objectUrl;link.download=ready.name;link.click();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),30_000);
      setMessage('Video downloaded. Send this file using your messaging or social app.');
    }
  };
  return <div className="match-video-actions">
    <button type="button" onClick={()=>void share()} disabled={busy}>{busy?'Preparing video…':'Share video'}</button>
    <a href={url} download={`arena-fight-${id}.${extension}`}>Download video</a>
    {message&&<p role="status">{message}</p>}
  </div>;
}