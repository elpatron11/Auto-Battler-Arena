import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
const bridge = html.split('/* Same-origin host bridge. All combat, orders, build, audio and UI logic above remains native. */')[1]
  ?.split('</script>')[0];
assert.ok(bridge, 'the arena host bridge must exist');

function harness({ recorder = null, captureStream = () => ({ getTracks: () => [{ stop() {} }] }), exportFrame = () => 'data:image/jpeg;base64,YQ==' } = {}) {
  const messages = [];
  const origins = [];
  const canvas = {
    captureStream,
    getContext: () => ({ drawImage() {} }),
    toDataURL: exportFrame,
    style: {}, nextElementSibling: { style: {} },
  };
  let elapsed = 0;
  const window = {
    MediaRecorder: recorder,
    parent: { postMessage: (message, origin) => { messages.push(message); origins.push(origin); } },
    addEventListener() {},
  };
  const context = vm.createContext({
    window, MediaRecorder: recorder, document: {
      getElementById: () => canvas,
      createElement: () => ({ ...canvas }),
    },
    performance: { now: () => elapsed },
    location: { origin: 'https://arena.example' },
    Blob, setInterval: () => 1, clearInterval() {},
    state: { over: false },
    startBattle() {}, createEntity() {}, showPriorityModal() {}, showOverlay() {},
  });
  const readyAnnouncement = "window.parent.postMessage({type:'arena:ready'},location.origin);";
  const announcementIndex = bridge.lastIndexOf(readyAnnouncement);
  const exposed = announcementIndex < 0 ? bridge : bridge.slice(0, announcementIndex) +
    `window.__recordingTest={
      begin(id){activeChallenge={id};beginArenaRecording();},
      result(id){resultReported=true;sampleArena();
        if(battleRecorder && battleRecorder.state==='recording')battleRecorder.stop();
        else finishSnapshots(id,false);}
    };
    ${readyAnnouncement}` + bridge.slice(announcementIndex + readyAnnouncement.length);
  assert.notEqual(exposed, bridge, 'recording test hook must attach to the production bridge');
  vm.runInContext(exposed, context);
  return {
    messages, origins, window,
    begin: id => window.__recordingTest.begin(id),
    result: id => { elapsed = 1500; window.__recordingTest.result(id); },
  };
}

function recordings(messages) {
  return messages.filter(message => message.type === 'arena:recording');
}

function assertSnapshot(message, id) {
  assert.equal(message.id, id);
  assert.equal(message.blob.type, 'application/vnd.arena.replay+json');
  assert.ok(message.blob.size <= 6_000_000);
}

test('unsupported MediaRecorder and canvas capture still save a snapshot', () => {
  for (const options of [{}, { recorder: { isTypeSupported: () => true }, captureStream: null }]) {
    const h = harness(options);
    h.begin('fight-1');
    h.result('fight-1');
    assert.equal(recordings(h.messages).length, 1);
    assertSnapshot(recordings(h.messages)[0], 'fight-1');
  }
  const h = harness({ recorder: { isTypeSupported: () => false } });
  h.begin('fight-2');
  h.result('fight-2');
  assertSnapshot(recordings(h.messages)[0], 'fight-2');
});

class FakeRecorder {
  static isTypeSupported = () => true;
  static instances = [];
  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    FakeRecorder.instances.push(this);
  }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
  chunk(size) { this.ondataavailable?.({ data: { size } }); }
}

test('recorder error and startup failure fall back to snapshot', () => {
  const h = harness({ recorder: FakeRecorder });
  h.begin('failed-fight');
  const recorder = FakeRecorder.instances.at(-1);
  recorder.onerror(new Error('encoder stopped'));
  h.result('failed-fight');
  assert.equal(recordings(h.messages).length, 1);
  assertSnapshot(recordings(h.messages)[0], 'failed-fight');

  class ThrowingRecorder extends FakeRecorder {
    start() { throw new Error('encoder unavailable'); }
  }
  const second = harness({ recorder: ThrowingRecorder });
  second.begin('startup-failure');
  second.result('startup-failure');
  assertSnapshot(recordings(second.messages)[0], 'startup-failure');
});

test('video exceeding 40 MB is discarded and the snapshot is saved instead', () => {
  const h = harness({ recorder: FakeRecorder });
  h.begin('large-fight');
  const recorder = FakeRecorder.instances.at(-1);
  recorder.chunk(40_000_001);
  h.result('large-fight');
  assert.equal(recordings(h.messages).length, 1);
  assertSnapshot(recordings(h.messages)[0], 'large-fight');
});

test('successful video does not also send a snapshot', () => {
  const h = harness({ recorder: FakeRecorder });
  h.begin('video-fight');
  FakeRecorder.instances.at(-1).chunk(100);
  h.result('video-fight');
  assert.equal(recordings(h.messages).length, 1);
  assert.equal(recordings(h.messages)[0].blob.type, 'video/webm');
});

test('no video and failed JPEG export report that no replay is available', () => {
  const exportFrame = () => { throw new Error('canvas export unavailable'); };
  for (const options of [
    { exportFrame },
    { recorder: FakeRecorder, exportFrame },
  ]) {
    const h = harness(options);
    h.begin('no-capture');
    if (options.recorder) FakeRecorder.instances.at(-1).onerror(new Error('encoder stopped'));
    h.result('no-capture');
    assert.equal(recordings(h.messages).length, 0);
    const statuses = h.messages.filter(message => message.type === 'arena:recording-unavailable');
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].id, 'no-capture');
    assert.equal(h.origins[h.messages.indexOf(statuses[0])], 'https://arena.example');
  }
});