import { useState } from 'react';
import { getGetArenaRecordingUrl } from '@workspace/api-client-react';
import {VideoShare} from './VideoShare';

export function ReplayVideo({ id, opponentName, contentType }: { id: string; opponentName: string; contentType: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const url = getGetArenaRecordingUrl(id);
  const extension = contentType === 'video/mp4' ? 'mp4' : 'webm';

  return <div>{failed
    ? <div className="match-video-error" role="alert">
        <p>This browser could not play the saved fight video. You can try again or download the recording to watch it elsewhere.</p>
        <div className="match-video-actions">
          <button type="button" onClick={() => { setAttempt(value => value + 1); setFailed(false); }}>Try again</button>
          <a href={url} download={`fight-${id}.${extension}`}>Download recording</a>
        </div>
      </div>
    : <video key={attempt} controls playsInline preload="metadata" src={url}
        onError={() => setFailed(true)} aria-label={`Replay against ${opponentName}`}>
        Your browser cannot play this recording.
      </video>}<VideoShare url={url} id={id} extension={extension}/></div>;
}