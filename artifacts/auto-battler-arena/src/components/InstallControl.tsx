import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallControl() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
    setInstalled(isStandalone());
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setOpen(false); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const install = async () => {
    if (!prompt) { setOpen(true); return; }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') { setOpen(false); setPrompt(null); }
      else setMessage('You can install later from your browser menu.');
    } catch {
      setMessage('Use your browser menu to add this app to your home screen or desktop.');
      setOpen(true);
    }
  };

  return <div className="install-control">
    <button className="btn btn-sm" type="button" onClick={() => prompt ? void install() : setOpen(value => !value)} data-testid="button-install-app" aria-expanded={open} aria-label="Install Fantasy World Arenas">
      <Download size={14}/> <span>Install</span>
    </button>
    {open && <div className="install-help" role="dialog" aria-label="Install instructions" data-testid="panel-install-instructions">
      <strong>Take the arena with you</strong>
      <p>{message || (isIOS
        ? 'On iPhone or iPad, open this page in Safari, tap Share, then choose Add to Home Screen. Other iOS browsers may offer the same option in their share menu.'
        : 'Open your browser menu and choose Install app, Create shortcut, or Add to Home screen. If the option is missing, your browser may not support installation here.')}</p>
      {prompt && <button className="btn btn-primary btn-sm" type="button" onClick={() => void install()} data-testid="button-confirm-install">Install app</button>}
      <button className="btn btn-sm" type="button" onClick={() => {setOpen(false);setMessage('');}} data-testid="button-close-install"><X size={13}/> Close</button>
    </div>}
  </div>;
}