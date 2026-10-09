import * as THREE from 'three';
import type { CharacterPose } from '../modelKit';

/** Cosmetic only: a single soft ground quad plus masked emission, no bloom or lights. */
export function createPrestigeGlow(root: THREE.Group, id: 'paladin' | 'warrior') {
  const owned: Array<{ dispose(): void }> = [];
  const strength = { value: 0.4 };
  const color = new THREE.Color(id === 'paladin' ? '#ffedac' : '#c0163d');
  const auraMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: color }, power: strength },
    vertexShader: `varying vec2 auraUv;
      void main(){ auraUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 auraUv; uniform vec3 tint; uniform float power;
      void main(){
        float r=length(auraUv-0.5)*2.0;
        float inner=(1.0-smoothstep(0.12,0.84,r))*0.17;
        float ring=(smoothstep(0.54,0.68,r)-smoothstep(0.71,0.90,r))*0.48;
        float fade=1.0-smoothstep(0.88,1.0,r);
        gl_FragColor=vec4(tint,(inner+ring)*fade*(0.65+power));
        #include <colorspace_fragment>
      }`,
  });
  const auraGeometry = new THREE.PlaneGeometry(4.5, 4.5);
  const aura = new THREE.Mesh(auraGeometry, auraMaterial);
  aura.name = 'prestige-ground-aura'; aura.userData.prestige = true;
  aura.userData.prestigeAura = true; aura.rotation.x = -Math.PI / 2; aura.position.y = 0.035;
  aura.renderOrder = 1; root.add(aura); owned.push(auraGeometry, auraMaterial);

   // Molten chest seams and shoulder crystals share one torso-local mesh.
  if (id === 'warrior') {
    let torso: THREE.Object3D | undefined;
    root.traverse(o => { if (o.userData.premiumJoint === 'torso') torso = o; });
    if (torso) {
      const vertices: number[] = [], indices: number[] = [];
      for (const sx of [-1, 1]) {
        const points = [[sx * 0.58, 0.46], [sx * 0.31, 0.21], [sx * 0.45, -0.02], [sx * 0.24, -0.27]];
        for (let i = 0; i < points.length - 1; i++) {
          const [x, y] = points[i], [xx, yy] = points[i + 1], offset = vertices.length / 3;
          const dx = xx - x, dy = yy - y, length = Math.hypot(dx, dy);
          const nx = -dy / length * 0.024, ny = dx / length * 0.024;
          vertices.push(x + nx, y + ny, 0.925, x - nx, y - ny, 0.925,
            xx - nx, yy - ny, 0.925, xx + nx, yy + ny, 0.925);
          indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
        }
        // Faceted crystals rooted in the existing pauldrons, never in the head joint.
        // Flat faces are duplicated for crisp normals without adding draw calls.
        for(let k=0;k<3;k++){
          const x=sx*(1.85+k*.17),y=1.30-k*.07,z=.10+k*.04,r=.13;
          const tip=[x+sx*.10,y+.55-k*.09,z-.05];
          const base=[[x-r,y,z-r],[x+r,y,z-r],[x+r,y,z+r],[x-r,y,z+r]];
          const triangle=(a:number[],b:number[],c:number[])=>{
            const offset=vertices.length/3;vertices.push(...a,...b,...c);
            indices.push(offset,offset+1,offset+2);
          };
          for(let face=0;face<4;face++)triangle(base[face],base[(face+1)%4],tip);
          triangle(base[0],base[2],base[1]);triangle(base[0],base[3],base[2]);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({ color: '#ff7628', side: THREE.DoubleSide });
      const seams = new THREE.Mesh(geometry, material);
      seams.name = 'prestige-molten-seams'; seams.userData.prestige = true;
      seams.userData.prestigeAccent = true; torso.add(seams); owned.push(geometry, material);
    }
  }

  const materials = new Set<THREE.MeshLambertMaterial>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh === aura || Array.isArray(mesh.material)) return;
    const material = mesh.material as THREE.MeshLambertMaterial;
    if (!material.isMeshLambertMaterial) return;
    let cape = false;
    for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
      if (node.userData.premiumJoint === 'cape') cape = true;
    }
    const source = mesh.geometry, positions = source.attributes.position, colors = source.attributes.color;
    if (!positions) return;
    const hsl = { h: 0, s: 0, l: 0 }; material.color.getHSL(hsl);
    const gold = hsl.h > 0.08 && hsl.h < 0.17 && hsl.s > 0.35;
    const orange = hsl.h < 0.09 && hsl.s > 0.6;
    const accent = mesh.userData.prestigeAccent || (id === 'warrior' && mesh.userData.prestige);
    const key = `${source.uuid}:${cape}:${gold}:${orange}:${Boolean(accent)}:${Boolean(mesh.userData.prestige)}`;
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = source.clone(); geometry.computeBoundingBox();
      const box = geometry.boundingBox!, width = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), 0.001);
      const height = Math.max(box.max.y - box.min.y, 0.001);
      const mask = new Float32Array(positions.count);
      for (let i = 0; i < positions.count; i++) {
        const edge = Math.abs(positions.getX(i)) / width > 0.82 ||
          (positions.getY(i) - box.min.y) / height > 0.87;
        if (cape) mask[i] = 0;
        else if (id === 'paladin') mask[i] = gold ? (edge ? 0.8 : 0.035) :
          mesh.userData.prestige ? (edge ? 0.22 : 0.025) : 0;
        else {
          const moltenVertex = colors && colors.getX(i) > 0.45 &&
            colors.getY(i) < colors.getX(i) * 0.7 && colors.getZ(i) < 0.15;
          mask[i] = accent || moltenVertex ? 0.95 : orange ? (edge ? 0.65 : 0.08) : 0;
        }
      }
      geometry.setAttribute('prestigeGlow', new THREE.Float32BufferAttribute(mask, 1));
      geometries.set(key, geometry); owned.push(geometry);
    }
    mesh.geometry = geometry;
    if (!materials.has(material)) {
      materials.add(material); material.emissive.copy(color); material.emissiveIntensity = 1;
      material.onBeforeCompile = shader => {
        shader.uniforms.prestigePulse = strength;
        shader.vertexShader = shader.vertexShader.replace('#include <common>',
          '#include <common>\nattribute float prestigeGlow; varying float vPrestigeGlow;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrestigeGlow=prestigeGlow;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
          '#include <common>\nuniform float prestigePulse; varying float vPrestigeGlow;')
          .replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vPrestigeGlow * prestigePulse;');
      };
      material.customProgramCacheKey = () => 'prestige-selective-emission';
      material.needsUpdate = true;
    }
  });
  let disposed = false;
  return {
    update(pose: CharacterPose) {
      const time = Number.isFinite(pose.time) ? pose.time : 0;
      const progress = Number.isFinite(pose.progress) ? THREE.MathUtils.clamp(pose.progress, 0, 1) : 0;
      const action = pose.mode === 'attack' || pose.mode === 'cast'
        ? Math.sin(progress * Math.PI) ** 2 : 0;
      strength.value = 0.38 + 0.045 * Math.sin(time * 1.8) + action * 0.65;
      aura.scale.setScalar(1 + action * 0.045);
      aura.userData.prestigeGlowStrength = strength.value;
    },
    dispose() { if (!disposed) { disposed = true; owned.forEach(resource => resource.dispose()); } },
  };
}