import { useEffect, useRef, type RefObject } from 'react';

const MOMENTUM_DECAY_MS = 340;
const MIN_MOMENTUM_VELOCITY = 0.02;

/**
 * iOS uses its accelerated iframe scrolling for menus. Other mobile browsers
 * keep the outer scroll surface so long menus remain reachable. Phone battles
 * stay viewport-sized so fixed controls remain visible.
 */
export function useGameFrameScrolling(frameRef: RefObject<HTMLIFrameElement | null>, topOffset = 0) {
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);

  return () => {
    cleanup.current();
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) return;

    const outer = frame.parentElement;
    // iOS 13+ scrolls subframes natively; forwarding their touch events to the
    // parent cancels Safari's momentum. iPadOS can report itself as a Mac.
    const nativeFrameScroll = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let wasBattleLocked = false;
    let wasPracticeLocked = false;
    let menuScroll = { outer: 0, x: 0, y: 0 };
    let momentumFrame: number | null = null;
    let touchVelocity = 0;
    let forwardingTouch = false;
    let lastTouchAt = 0;
    const cancelMomentum = () => {
      if (momentumFrame !== null) window.cancelAnimationFrame(momentumFrame);
      momentumFrame = null;
    };
    const startMomentum = () => {
      if (!outer || Math.abs(touchVelocity) < MIN_MOMENTUM_VELOCITY) return;
      // The touch belongs to the iframe, so iOS cannot give the outer scroll
      // surface its native release momentum. Continue the forwarded gesture
      // briefly after release instead of leaving it to stop abruptly.
      let velocity = touchVelocity;
      let previousFrameAt = 0;
      const step = (now: number) => {
        if (!outer || doc.body.classList.contains('battleMode') || doc.body.classList.contains('adminPracticeOpen')) {
          momentumFrame = null;
          return;
        }
        if (previousFrameAt === 0) {
          previousFrameAt = now;
          momentumFrame = window.requestAnimationFrame(step);
          return;
        }
        const elapsed = Math.min(40, Math.max(0, now - previousFrameAt));
        previousFrameAt = now;
        const decay = Math.exp(-elapsed / MOMENTUM_DECAY_MS);
        const scrollDelta = velocity * MOMENTUM_DECAY_MS * (1 - decay);
        velocity *= decay;
        const before = outer.scrollTop;
        outer.scrollTop += scrollDelta;
        if (Math.abs(outer.scrollTop - before - scrollDelta) > 0.5 ||
          Math.abs(velocity) < MIN_MOMENTUM_VELOCITY) {
          momentumFrame = null;
          return;
        }
        momentumFrame = window.requestAnimationFrame(step);
      };
      momentumFrame = window.requestAnimationFrame(step);
    };
    const app = doc.getElementById('app');
    const refresh = () => {
      const practiceLocked = doc.documentElement.classList.contains('game-starting') ||
        doc.body.classList.contains('adminPracticeOpen') ||
        doc.body.classList.contains('hourlyDungeonDialogOpen') ||
        doc.body.classList.contains('arenaTipOpen') ||
        doc.body.classList.contains('mobileGameDialogOpen') ||
        !!doc.getElementById('tutorialModal')?.classList.contains('open');
      const viewportHeight = Math.max(1,
        (window.visualViewport?.height ?? window.innerHeight) - Math.max(topOffset, frame.offsetTop || 0));
      // Use the host viewport, not the content-height iframe, for lobby rotation.
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      doc.documentElement.toggleAttribute('data-lobby-landscape',
        viewportWidth > (window.visualViewport?.height ?? window.innerHeight) &&
        viewportWidth <= 1000 && viewportHeight <= 600);
      // Media queries inside an iframe use its own dimensions. A tall menu can
      // make the iframe appear portrait even after the phone rotates.
      const battleLocked = doc.body.classList.contains('battleMode') &&
        window.matchMedia('(max-width:700px), (pointer:coarse), (orientation:landscape) and (max-height:600px)').matches;
      if (battleLocked || practiceLocked) cancelMomentum();
      if (practiceLocked) {
        if (!wasPracticeLocked) {
          menuScroll = { outer: outer?.scrollTop ?? 0,
            x: doc.defaultView?.scrollX ?? 0, y: doc.defaultView?.scrollY ?? 0 };
        }
        if (frame.style.height !== `${viewportHeight}px`) frame.style.height = `${viewportHeight}px`;
        if (!wasPracticeLocked) {
          doc.defaultView?.scrollTo(0, 0);
          outer?.scrollTo({ top: 0 });
        }
      } else if (nativeFrameScroll) {
        if (frame.style.height !== `${viewportHeight}px`) frame.style.height = `${viewportHeight}px`;
        if (battleLocked && !wasBattleLocked) {
          doc.defaultView?.scrollTo(0, 0);
          outer?.scrollTo({ top: 0 });
        }
      } else if (!battleLocked) {
        // Measure the content, not the iframe document: its minimum height is
        // the iframe's old height. Shrinking the iframe first briefly clamps
        // the outer scroll position to zero on every ResizeObserver callback.
        const bottom = app
          ? app.getBoundingClientRect().bottom + (doc.defaultView?.scrollY ?? 0)
          : doc.body.scrollHeight;
        const contentHeight = Math.ceil(Math.max(viewportHeight, bottom));
        if (frame.style.height !== `${contentHeight}px`) frame.style.height = `${contentHeight}px`;
      } else if (!wasBattleLocked) {
        frame.style.height = `${viewportHeight}px`;
        frame.parentElement?.scrollTo({ top: 0 });
      } else if (frame.style.height !== `${viewportHeight}px`) {
        frame.style.height = `${viewportHeight}px`;
      }
      if (wasPracticeLocked && !practiceLocked && !battleLocked) {
        doc.defaultView?.scrollTo(menuScroll.x, menuScroll.y);
        outer?.scrollTo({ top: menuScroll.outer });
      }
      wasPracticeLocked = practiceLocked;
      wasBattleLocked = battleLocked;
    };

    let resizeRefreshFrame: number | null = null;
    const scheduleResizeRefresh = () => {
      if (resizeRefreshFrame !== null) return;
      resizeRefreshFrame = window.requestAnimationFrame(() => {
        resizeRefreshFrame = null;
        refresh();
      });
    };
    const cancelScheduledResizeRefresh = () => {
      if (resizeRefreshFrame !== null) window.cancelAnimationFrame(resizeRefreshFrame);
      resizeRefreshFrame = null;
    };
    const resizeObserver = new ResizeObserver(scheduleResizeRefresh);
    resizeObserver.observe(doc.body);
    if (app) resizeObserver.observe(app);
    const classObserver = new MutationObserver(refresh);
    classObserver.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    classObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
    const tutorial=doc.getElementById('tutorialModal');
    if(tutorial)classObserver.observe(tutorial,{attributes:true,attributeFilter:['class']});
    const hasInnerScroll = (target: EventTarget | null) => {
      let element = target instanceof doc.defaultView!.Element ? target as Element : null;
      while (element && element !== doc.body && element !== doc.documentElement) {
        const style = doc.defaultView!.getComputedStyle(element);
        // Dialogs and their scrollable contents must keep their own gestures.
        if (style.position === 'fixed' ||
          ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            element.scrollHeight > element.clientHeight + 1)) return true;
        element = element.parentElement;
      }
      return false;
    };
    const shouldForward = (target: EventTarget | null) =>
      !!outer && !doc.body.classList.contains('battleMode') &&
      !doc.body.classList.contains('adminPracticeOpen') &&
      !doc.body.classList.contains('mobileGameDialogOpen') &&
      !doc.body.classList.contains('arenaTipOpen') &&
      !doc.body.classList.contains('hourlyDungeonDialogOpen') && !hasInnerScroll(target);
    let lastTouchY: number | null = null;
    let forwardingStarted = false;
    const onTouchStart = (event: TouchEvent) => {
      cancelMomentum();
      forwardingStarted = false;
      lastTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
      lastTouchAt = event.timeStamp;
      touchVelocity = 0;
      forwardingTouch = lastTouchY !== null && shouldForward(event.target);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        lastTouchY = null;
        forwardingTouch = false;
        touchVelocity = 0;
        return;
      }
      if (lastTouchY === null) return;
      const y = event.touches[0].clientY;
      if (forwardingTouch && shouldForward(event.target)) {
        // Tiny finger movement is still a tap. Preventing its touchmove cancels
        // the browser's click, including the in-game Notifications button.
        if (!forwardingStarted && Math.abs(lastTouchY - y) < 6) return;
        forwardingStarted = true;
        const scrollDelta = lastTouchY - y;
        outer!.scrollTop += scrollDelta;
        event.preventDefault();
        const elapsed = Math.max(1, event.timeStamp - lastTouchAt);
        touchVelocity = touchVelocity * 0.65 + (scrollDelta / elapsed) * 0.35;
      } else {
        touchVelocity = 0;
      }
      lastTouchY = y;
      lastTouchAt = event.timeStamp;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (forwardingTouch && event.timeStamp - lastTouchAt < 100) startMomentum();
      lastTouchY = null;
      forwardingTouch = false;
    };
    const onTouchCancel = () => {
      lastTouchY = null;
      forwardingTouch = false;
      touchVelocity = 0;
      cancelMomentum();
    };
    const onWheel = (event: WheelEvent) => {
      if (!shouldForward(event.target)) return;
      cancelMomentum();
      outer!.scrollTop += event.deltaY;
      event.preventDefault();
    };
    if (!nativeFrameScroll) {
      doc.addEventListener('touchstart', onTouchStart, { passive: true });
      doc.addEventListener('touchmove', onTouchMove, { passive: false });
      doc.addEventListener('touchend', onTouchEnd, { passive: true });
      doc.addEventListener('touchcancel', onTouchCancel, { passive: true });
      doc.addEventListener('wheel', onWheel, { passive: false });
    }
    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    document.addEventListener('fullscreenchange', scheduleResizeRefresh);
    document.addEventListener('webkitfullscreenchange', scheduleResizeRefresh);
    window.addEventListener('orientationchange', scheduleResizeRefresh);
    doc.defaultView?.addEventListener('resize', refresh);
    refresh();
    cleanup.current = () => {
      cancelMomentum();
      cancelScheduledResizeRefresh();
      resizeObserver.disconnect();
      classObserver.disconnect();
      doc.removeEventListener('touchstart', onTouchStart);
      doc.removeEventListener('touchmove', onTouchMove);
      doc.removeEventListener('touchend', onTouchEnd);
      doc.removeEventListener('touchcancel', onTouchCancel);
      doc.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
      document.removeEventListener('fullscreenchange', scheduleResizeRefresh);
      document.removeEventListener('webkitfullscreenchange', scheduleResizeRefresh);
      window.removeEventListener('orientationchange', scheduleResizeRefresh);
      doc.defaultView?.removeEventListener('resize', refresh);
    };
  };
}