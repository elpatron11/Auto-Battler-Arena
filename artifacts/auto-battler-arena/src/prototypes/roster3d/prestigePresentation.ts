import * as THREE from 'three';
import type { CharacterPose } from './modelKit';

/** One unlit quad outside the character rig; selection-only light/smoke, never model geometry. */
export function createPrestigePresentation(id: 'warrior' | 'paladin', low = false) {
  const root = new THREE.Group();
  root.name = 'prestige-selection-presentation';
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    uniforms: { time: { value: 0 }, holy: { value: id === 'paladin' ? 1 : 0 },
      density: { value: low ? 2 : 4 }, motion: { value: 1 }, pulse: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv; uniform float time,holy,density,motion,pulse;
      float seg(vec2 p,vec2 a,vec2 b){vec2 v=b-a;float t=clamp(dot(p-a,v)/dot(v,v),0.,1.);return length(p-a-v*t);}
      void main(){
        vec2 p=vUv-.5;float t=time*motion;
        vec3 c;float alpha=0.;
        if(holy>.5){
          vec2 h=p-vec2(0.,.22);float r=length(h);float a=atan(h.y,h.x);
          float ring=1.-smoothstep(.003,.011,abs(r-.185));
          float rim=1.-smoothstep(.002,.006,abs(r-.206));
          float rays=(1.-smoothstep(.04,.13,abs(sin(a*12.))))*
            smoothstep(.21,.218,r)*(1.-smoothstep(.238,.25,r));
          float feathers=0.;
          for(int i=0;i<5;i++){
            if(float(i)<density+1.){
              float k=float(i);
              for(int side=0;side<2;side++){
                float s=side==0?-1.:1.;
                float d=seg(p,vec2(s*.07,.02),vec2(s*(.31+k*.026),.18-k*.05));
                feathers=max(feathers,1.-smoothstep(.002,.008,d));
              }
            }
          }
          alpha=(ring*.23+rim*.13+rays*.16+feathers*.10)*(1.+pulse*.3);
          c=mix(vec3(1.,.82,.40),vec3(1.,.99,.92),ring*.5+feathers*.5);
        }else{
          float smoke=0.,ember=0.,energy=0.;
          for(int i=0;i<4;i++){
            if(float(i)<density){
              float k=float(i),q=fract(t*.085+k*.27);
              vec2 at=vec2(sin(k*2.4+t*.27)*(.12+q*.08),-.26+q*.58);
              float d=length((p-at)*vec2(1.,.7));
              smoke+=exp(-d*d/(.008+q*.014))*(1.-q)*.13;
              vec2 ep=vec2(sin(k*2.8+t*.22)*.25,-.32+fract(t*.13+k*.29)*.7);
              ember+=exp(-dot(p-ep,p-ep)*12000.)*.55;
            }
          }
          for(int side=0;side<2;side++){
            float s=side==0?-1.:1.;
            float x=s*(.14+sin(p.y*15.+t*.9)*.015);
            energy+=(1.-smoothstep(.002,.008,abs(p.x-x)))*
              smoothstep(-.35,-.22,p.y)*(1.-smoothstep(.13,.29,p.y))*.09;
          }
          float red=ember+energy;
          alpha=min(.35,smoke+red)*(1.+pulse*.18);
          c=mix(vec3(.025,.008,.021),vec3(.65,.015,.055),clamp(red/max(alpha,.001),0.,1.));
        }
        if(alpha<.004)discard;
        gl_FragColor=vec4(c,alpha);
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new THREE.PlaneGeometry(7, 7);
  const quad = new THREE.Mesh(geometry, material);
  quad.renderOrder = -1; quad.frustumCulled = false; root.add(quad);
  let disposed = false;
  return {
    root,
    update(pose: CharacterPose, camera: THREE.Camera, reduced = false) {
      material.uniforms.time.value = Number.isFinite(pose.time) ? pose.time : 0;
      material.uniforms.motion.value = reduced ? 0 : 1;
      const p = Number.isFinite(pose.progress) ? THREE.MathUtils.clamp(pose.progress, 0, 1) : 0;
      material.uniforms.pulse.value = reduced ? 0 : pose.mode === 'cast' ? Math.sin(p * Math.PI) ** 2 : 0;
      const dx = camera.position.x, dz = camera.position.z, length = Math.hypot(dx, dz) || 1;
      root.position.set(-dx / length * 1.5, 3.25, -dz / length * 1.5);
      root.quaternion.copy(camera.quaternion);
    },
    dispose() {
      if (disposed) return;
      disposed = true; geometry.dispose(); material.dispose(); root.removeFromParent();
    },
  };
}