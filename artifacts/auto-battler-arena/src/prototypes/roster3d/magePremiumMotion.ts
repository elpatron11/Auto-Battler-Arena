import type { CharacterModel, CharacterPose } from './modelKit';
import type { PolishMotionModel } from './polishMotion';
import type { Object3D, Mesh } from 'three';

/** Cryomancer-only secondary animation; the base pose/timeline is forwarded unchanged. */
export function createPremiumMageMotion(model: CharacterModel): PolishMotionModel {
  const body = model.root.children[0];
  const torso = body?.children.find(o => o.type === 'Group' && Math.abs(o.position.y - 1.4) < .01 && Math.abs(o.position.x) < .01);
  const head = torso?.children.find(o => o.type === 'Group' && Math.abs(o.position.y - 2.35) < .01);
  const cape = torso?.children.find(o => o.type === 'Group' && Math.abs(o.position.z + .55) < .01);
  const armL = torso?.children.find(o => o.type === 'Group' && Math.abs(o.position.x - 1) < .01);
  const armR = torso?.children.find(o => o.type === 'Group' && Math.abs(o.position.x + 1) < .01);
  const weapon = armR?.children.find(o => o.type === 'Group' && Math.abs(o.position.y + 1.3) < .01);
  const hat = head?.children.find(o => Math.abs(o.position.y - 1.5) < .01);
  const beard = head?.children.find(o => {
    if (o.userData.part === 'beard') return true;
    if (Math.abs(o.position.y + .95) < .01 && Math.abs(o.position.z - .5) < .01) return true;
    const mesh = o as Mesh;
    // The premium sculpt bakes its beard into head-local geometry; identify that
    // long mass once, without changing its hierarchy or searching every frame.
    if (!mesh.isMesh) return false;
    mesh.geometry.computeBoundingBox();
    return Math.abs(o.position.y) < .01 && (mesh.geometry.boundingBox?.min.y ?? 0) < -1.4;
  });
  const joints = [body, torso, head, cape, beard, armL, armR, weapon, hat].filter((o): o is Object3D => !!o);
  const saved = joints.map(o => ({ position: o.position.clone(), rotation: o.rotation.clone(), scale: o.scale.clone() }));
  let prior = false, hit = 0, death = 0;
  const clamp = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  return {
    ...model,
    setVisualReaction(h, d = 0) { hit = clamp(h); death = clamp(d); },
    animate(pose: CharacterPose) {
      if (prior) joints.forEach((o, i) => { o.position.copy(saved[i].position); o.rotation.copy(saved[i].rotation); o.scale.copy(saved[i].scale); });
      model.animate(pose);
      joints.forEach((o, i) => { saved[i].position.copy(o.position); saved[i].rotation.copy(o.rotation); saved[i].scale.copy(o.scale); });
      prior = true;
      const t = Number.isFinite(pose.time) ? pose.time : 0, p = clamp(pose.progress);
      const idle = pose.mode === 'idle', running = pose.mode === 'run';
      const stride = running ? Math.sin(t * 9) : 0;
      const cast = pose.mode === 'cast' ? Math.sin(p * Math.PI) : 0;
      // Follow-through never changes an attack progress value or its impact event.
      const follow = pose.mode === 'attack' && p > .55 ? Math.sin((p - .55) / .45 * Math.PI) : 0;
      const windup = pose.mode === 'attack' && p < .4 ? Math.sin(p / .4 * Math.PI) : 0;
      if (body) {
        body.position.y += (idle ? Math.sin(t * 1.9) * .032 : 0) + cast * .04 - hit * .035 - death * .1;
        body.rotation.z += follow * .065 - windup * .045 - hit * .06;
        body.rotation.x += (running ? .035 : 0) - windup * .025 + follow * .045 + hit * .1 + death * .28;
      }
      if (torso) {
        torso.rotation.y += (idle ? Math.sin(t * .85) * .032 : 0) - windup * .085 + follow * .12;
        torso.rotation.z += cast * Math.sin(p * Math.PI * 2) * .04 - stride * .018;
      }
      if (head) {
        head.rotation.x += cast * .035 + follow * .07 - (running ? .04 : 0);
        head.rotation.z += idle ? Math.sin(t * 1.15 + .4) * .025 : follow * .05 - stride * .02;
      }
      if (armL) { armL.rotation.z -= cast * .08; armL.rotation.y -= cast * .12; }
      if (armR) { armR.rotation.z += windup * .03 + cast * .025; }
      if (weapon) {
        weapon.rotation.x += (idle ? Math.sin(t * 1.6 - .3) * .018 : 0) - windup * .06 + follow * .1;
        weapon.rotation.z += stride * .02 + cast * .035;
      }
      if (hat) { hat.rotation.z += (idle ? Math.sin(t * 1.9 - .5) * .012 : 0) - stride * .018 + follow * .035; }
      if (cape) {
        cape.rotation.x += (idle ? Math.sin(t * 1.9 - .7) * .055 : 0) +
          (running ? .065 + Math.sin(t * 9 - .8) * .04 : 0) + cast * .09 + follow * .17;
        cape.rotation.z += follow * .065 - stride * .025;
      }
      if (beard) {
        beard.rotation.x += (idle ? Math.sin(t * 1.9 - .6) * .025 : 0) -
          cast * .045 + follow * .085 + (running ? Math.sin(t * 9 - .5) * .018 : 0);
        beard.rotation.z += follow * .04;
      }
    },
  };
}