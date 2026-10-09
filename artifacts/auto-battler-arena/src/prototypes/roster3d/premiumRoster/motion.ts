import type { Object3D } from 'three';
import type { CharacterModel, CharacterPose } from '../modelKit';
import type { ModelId } from '../creatures';
import type { PolishMotionModel } from '../polishMotion';

/** Cosmetic layers over the existing rig and exact supplied combat pose. */
export function createPremiumRosterMotion(model: CharacterModel, id: ModelId): PolishMotionModel {
  const objects: Object3D[] = [];
  model.root.traverse(o => objects.push(o));
  const body = objects.find(o => o.userData.premiumJoint === 'body') || model.root.children[0];
  const torso = objects.find(o => o.userData.premiumJoint === 'torso') ||
    body?.children.find(o => o.type === 'Group' && Math.abs(o.position.y - 1.4) < .01 && Math.abs(o.position.x) < .01);
  const head = objects.find(o => o.userData.premiumJoint === 'head') ||
    torso?.children.find(o => o.type === 'Group' && Math.abs(o.position.y - 2.35) < .01);
  const cape = objects.find(o => o.userData.premiumJoint === 'cape' || o.userData.part === 'cloak' || o.userData.part === 'cape') ||
    torso?.children.find(o => o.type === 'Group' && Math.abs(o.position.z + .55) < .01);
  const joints = [...new Set([body, torso, head, cape].filter((o): o is Object3D => !!o))];
  const saved = joints.map(o => ({ p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() }));
  const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  let prior = false, hit = 0, death = 0;
  return {
    ...model,
    setVisualReaction(h, d = 0) { hit = clamp(h); death = clamp(d); },
    animate(pose: CharacterPose) {
      if (prior) joints.forEach((o, i) => { o.position.copy(saved[i].p); o.rotation.copy(saved[i].r); o.scale.copy(saved[i].s); });
      model.animate(pose);
      joints.forEach((o, i) => { saved[i].p.copy(o.position); saved[i].r.copy(o.rotation); saved[i].s.copy(o.scale); });
      prior = true;
      const t = Number.isFinite(pose.time) ? pose.time : 0, p = clamp(pose.progress);
      const idle = pose.mode === 'idle', run = pose.mode === 'run';
      const cast = pose.mode === 'cast' ? Math.sin(p * Math.PI) : 0;
      const follow = pose.mode === 'attack' && p > .55 ? Math.sin((p - .55) / .45 * Math.PI) : 0;
      const windup = pose.mode === 'attack' && p < .4 ? Math.sin(p / .4 * Math.PI) : 0;
      const agile = id === 'rogue' || id === 'archer', heavy = id === 'warrior' || id === 'paladin';
      const weight = heavy ? .7 : 1, stride = run ? Math.sin(t * 9) : 0;
      if (body) {
        body.position.y += (idle ? Math.sin(t * 1.8) * .025 : 0) + cast * .025 - hit * .035 - death * .08;
        body.rotation.x += (run ? agile ? .065 : .035 : 0) - windup * .03 + follow * .055 + hit * .09 + death * .24;
        body.rotation.z += weight * (follow * .04 - windup * .025 - hit * .05);
      }
      if (torso) {
        torso.rotation.y += weight * ((idle ? Math.sin(t * .85) * .025 : 0) - windup * .05 + follow * .075);
        torso.rotation.z -= stride * .012;
      }
      if (head) head.rotation.z += (idle ? Math.sin(t * 1.15 + .4) * .018 : 0) - stride * .012 + follow * .03;
      if (cape) {
        cape.rotation.x += (idle ? Math.sin(t * 1.8 - .7) * .045 : 0) +
          (run ? .05 + Math.sin(t * 9 - .8) * .035 : 0) + cast * .065 + follow * .12;
        cape.rotation.z += follow * .035 - stride * .018;
      }
    },
  };
}