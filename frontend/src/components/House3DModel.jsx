import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export default function House3DModel({ landAreaSqFt = 1500, buildingType = 'Residential House' }) {
  const mountRef = useRef(null)
  
  const [stats, setStats] = useState({
    landArea: 0,
    footprint: 0,
    openArea: 0,
    floors: 1,
    type: 'Residential House'
  })

  useEffect(() => {
    if (!mountRef.current) return

    const sqft = Number(landAreaSqFt) || 1500;
    const sqMeters = sqft * 0.092903;
    const plotSize = Math.max(4, Math.sqrt(sqMeters)); 

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#E2E8F0');
    scene.fog = new THREE.FogExp2('#E2E8F0', 0.015);

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    
    camera.position.set(plotSize * 1.5, plotSize * 1.0 + 5, plotSize * 1.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    while (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.target.set(0, 0, 0);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(plotSize, plotSize * 2, plotSize * 0.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = plotSize * 5;
    sunLight.shadow.camera.left = -plotSize;
    sunLight.shadow.camera.right = plotSize;
    sunLight.shadow.camera.top = plotSize;
    sunLight.shadow.camera.bottom = -plotSize;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const disposables = [];

    const createMesh = (geometry, material, castShadow = true, receiveShadow = true) => {
      disposables.push(geometry, material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      scene.add(mesh);
      return mesh;
    };

    const matGrass = new THREE.MeshStandardMaterial({ color: 0x8CB035, roughness: 1.0 });
    const matConcrete = new THREE.MeshStandardMaterial({ color: 0xD4D4D8, roughness: 0.8 });
    const matPlasterWhite = new THREE.MeshStandardMaterial({ color: 0xFAFAFA, roughness: 0.95 });
    const matPlasterGrey = new THREE.MeshStandardMaterial({ color: 0x71717A, roughness: 0.9 });
    const matWood = new THREE.MeshStandardMaterial({ color: 0xC19A6B, roughness: 0.7 });
    const matDarkWood = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.8 });
    const matGlass = new THREE.MeshPhysicalMaterial({ 
      color: 0x111111, metalness: 0.9, roughness: 0.1, 
      transparent: true, opacity: 0.75, envMapIntensity: 1.0 
    });
    const matBlueGlass = new THREE.MeshPhysicalMaterial({ 
      color: 0x1E3A8A, metalness: 0.9, roughness: 0.1, 
      transparent: true, opacity: 0.8, envMapIntensity: 1.0 
    });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });
    const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x52525B, roughness: 0.9 });
    const matHospitalCross = new THREE.MeshStandardMaterial({ color: 0xDC2626, roughness: 0.5 });
    const matBrick = new THREE.MeshStandardMaterial({ color: 0xA52A2A, roughness: 0.9 });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x9CA3AF, roughness: 0.9 });

    const addWindow = (w, h, x, y, z, rotY = 0, mat = matGlass) => {
      const win = createMesh(new THREE.BoxGeometry(w, h, 0.1), mat);
      const frame = createMesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.05), matFrame);
      win.position.set(x, y, z);
      frame.position.set(x, y, z);
      win.rotation.y = rotY;
      frame.rotation.y = rotY;
    };

    const addSkylight = (w, d, x, y, z) => {
      const frame = createMesh(new THREE.BoxGeometry(w, 0.15, d), matFrame);
      frame.position.set(x, y + 0.075, z);
      const glass = createMesh(new THREE.BoxGeometry(w - 0.2, 0.2, d - 0.2), matBlueGlass);
      glass.position.set(x, y + 0.1, z);
    };

    const groundGeo = new THREE.PlaneGeometry(plotSize, plotSize);
    const ground = createMesh(groundGeo, matGrass, false, true);
    ground.rotation.x = -Math.PI / 2;

    let computedFootprintSqFt = 0;
    let computedFloors = 1;
    let typName = buildingType;

    switch (buildingType) {
        case 'Commercial Building': {
            const flHeight = 3.5;
            const coverage = 0.6;
            const footprint = sqMeters * coverage;
            computedFootprintSqFt = footprint * 10.7639;
            const bW = Math.sqrt(footprint) * 1.5;
            const bD = footprint / bW;
            computedFloors = Math.max(2, Math.floor(sqMeters / 300));
            const totalH = computedFloors * flHeight;

            const plaza = createMesh(new THREE.BoxGeometry(plotSize, 0.1, plotSize * 0.4), matConcrete);
            plaza.position.set(0, 0.05, plotSize/2 - (plotSize*0.4)/2);

            const tower = createMesh(new THREE.BoxGeometry(bW, totalH, bD), matBlueGlass);
            tower.position.set(0, totalH/2, -plotSize/2 + bD/2 + 1);

            for (let i = 1; i <= computedFloors; i++) {
                const slab = createMesh(new THREE.BoxGeometry(bW + 0.2, 0.2, bD + 0.2), matConcrete);
                slab.position.set(0, i * flHeight, -plotSize/2 + bD/2 + 1);
            }
            
            const canopy = createMesh(new THREE.BoxGeometry(bW * 0.4, 0.4, 4), matConcrete);
            canopy.position.set(0, flHeight, -plotSize/2 + bD + 2);
            
            const p1 = createMesh(new THREE.CylinderGeometry(0.2, 0.2, flHeight), matConcrete);
            p1.position.set(-bW*0.15, flHeight/2, -plotSize/2 + bD + 3);
            const p2 = createMesh(new THREE.CylinderGeometry(0.2, 0.2, flHeight), matConcrete);
            p2.position.set(bW*0.15, flHeight/2, -plotSize/2 + bD + 3);
            break;
        }
        case 'Apartment': {
            const flHeight = 3.0;
            const coverage = 0.5; 
            const footprint = sqMeters * coverage;
            computedFootprintSqFt = footprint * 10.7639;
            const bW = Math.min(plotSize - 2, Math.sqrt(footprint) * 1.2);
            const bD = Math.min(plotSize - 2, footprint / bW);
            computedFloors = Math.max(3, Math.floor(sqMeters / 250));
            const totalH = computedFloors * flHeight;
            const baseZ = -plotSize/2 + bD/2 + 2;

            const apt = createMesh(new THREE.BoxGeometry(bW, totalH, bD), matPlasterWhite);
            apt.position.set(0, totalH/2, baseZ);

            for (let i = 1; i < computedFloors; i++) {
                const balH = i * flHeight;
                const bal = createMesh(new THREE.BoxGeometry(bW * 0.8, 0.2, 1.5), matConcrete);
                bal.position.set(0, balH, baseZ + bD/2 + 0.75);
                const glass = createMesh(new THREE.BoxGeometry(bW * 0.8, 1.0, 0.1), matGlass);
                glass.position.set(0, balH + 0.5, baseZ + bD/2 + 1.45);
            }

            const lobby = createMesh(new THREE.BoxGeometry(bW * 0.4, flHeight, 2.0), matGlass);
            lobby.position.set(0, flHeight/2, baseZ + bD/2 + 1.0);

            const path = createMesh(new THREE.PlaneGeometry(6, plotSize/2), matAsphalt, false, true);
            path.rotation.x = -Math.PI / 2;
            path.position.set(0, 0.02, plotSize/4);
            break;
        }
        case 'Hospital': {
            const flHeight = 4.0;
            const coverage = 0.65;
            const footprint = sqMeters * coverage;
            computedFootprintSqFt = footprint * 10.7639;
            const bW = Math.min(plotSize - 4, Math.sqrt(footprint) * 2);
            const bD = footprint / bW;
            computedFloors = Math.max(3, Math.floor(sqMeters / 800));
            const baseZ = -plotSize/2 + bD/2 + 3;

            const block = createMesh(new THREE.BoxGeometry(bW, computedFloors * flHeight, bD), matPlasterWhite);
            block.position.set(0, (computedFloors * flHeight)/2, baseZ);

            const crossV = createMesh(new THREE.BoxGeometry(1.5, 4, 0.5), matHospitalCross);
            crossV.position.set(0, computedFloors*flHeight + 2, baseZ + bD/2 + 0.1);
            const crossH = createMesh(new THREE.BoxGeometry(4, 1.5, 0.5), matHospitalCross);
            crossH.position.set(0, computedFloors*flHeight + 2, baseZ + bD/2 + 0.1);

            const dropW = bW * 0.4;
            const dropRoof = createMesh(new THREE.BoxGeometry(dropW, 0.5, 6), matConcrete);
            dropRoof.position.set(0, flHeight, baseZ + bD/2 + 3);
            
            const col1 = createMesh(new THREE.CylinderGeometry(0.3, 0.3, flHeight), matConcrete);
            col1.position.set(-dropW/2 + 0.5, flHeight/2, baseZ + bD/2 + 5);
            const col2 = createMesh(new THREE.CylinderGeometry(0.3, 0.3, flHeight), matConcrete);
            col2.position.set(dropW/2 - 0.5, flHeight/2, baseZ + bD/2 + 5);

            const loopGeo = new THREE.PlaneGeometry(plotSize * 0.8, 12);
            const loop = createMesh(loopGeo, matAsphalt, false, true);
            loop.rotation.x = -Math.PI/2;
            loop.position.set(0, 0.02, baseZ + bD/2 + 5);
            break;
        }
        case 'School': {
            const flHeight = 3.5;
            const coverage = 0.4;
            const footprint = sqMeters * coverage;
            computedFootprintSqFt = footprint * 10.7639;
            const bW = Math.min(plotSize - 2, Math.sqrt(footprint) * 2.5);
            const bD = footprint / bW;
            computedFloors = Math.max(2, Math.floor(sqMeters / 600));
            const baseZ = -plotSize/2 + bD/2 + 2;

            const backWing = createMesh(new THREE.BoxGeometry(bW, computedFloors * flHeight, bD), matBrick);
            backWing.position.set(0, (computedFloors * flHeight)/2, baseZ);
            
            const wingD = plotSize * 0.4;
            const wingW = bD * 1.5;
            const leftWing = createMesh(new THREE.BoxGeometry(wingW, computedFloors * flHeight, wingD), matBrick);
            leftWing.position.set(-bW/2 + wingW/2, (computedFloors * flHeight)/2, baseZ + bD/2 + wingD/2);

            const rightWing = createMesh(new THREE.BoxGeometry(wingW, computedFloors * flHeight, wingD), matBrick);
            rightWing.position.set(bW/2 - wingW/2, (computedFloors * flHeight)/2, baseZ + bD/2 + wingD/2);

            const courtW = bW - wingW*2;
            const court = createMesh(new THREE.PlaneGeometry(courtW, wingD), matConcrete, false, true);
            court.rotation.x = -Math.PI/2;
            court.position.set(0, 0.02, baseZ + bD/2 + wingD/2);

            const field = createMesh(new THREE.PlaneGeometry(plotSize*0.8, plotSize*0.3), matGrass, false, true);
            field.rotation.x = -Math.PI/2;
            field.position.set(0, 0.03, plotSize/2 - plotSize*0.15 - 1);
            break;
        }
        default: { 
            // REFERENCE IMAGE: MODERN HOUSE RECREATION
            const coverage = 0.45;
            const footprint = sqMeters * coverage;
            computedFootprintSqFt = footprint * 10.7639;
            computedFloors = sqMeters > 70 ? 2 : 1; 

            if (sqMeters <= 70) {
              typName = "Compact Modern House";
            } else if (sqMeters > 200) {
              typName = "Spacious Modern Villa w/ Garage";
            } else {
              typName = "2-Floor Modern Residence";
            }

            let bW = Math.sqrt(footprint) * 1.3;
            let bD = footprint / bW;

            // Fit inside plot
            const maxBuild = plotSize - 2.0;
            if (bW > maxBuild) { bW = maxBuild; bD = footprint / bW; }
            if (bD > maxBuild) { bD = maxBuild; bW = footprint / bD; }

            const flHeight = 3.2; 
            const baseZ = -plotSize/2 + bD/2 + 1.5; 

            // 1. Ground Floor - Grey L-shape base (right side)
            const gfBaseW = bW * 0.6;
            const gfBaseD = bD * 0.9;
            const gfBase = createMesh(new THREE.BoxGeometry(gfBaseW, flHeight, gfBaseD), matPlasterGrey);
            gfBase.position.set(bW/2 - gfBaseW/2, flHeight/2, baseZ);

            // 2. Garage (Recessed into Ground Floor Base)
            const garW = gfBaseW * 0.7;
            const garH = 2.4;
            const garageShutter = createMesh(new THREE.BoxGeometry(garW, garH, 0.1), matFrame);
            garageShutter.position.set(bW/2 - gfBaseW/2, garH/2, baseZ + gfBaseD/2 + 0.01);
            
            const driveway = createMesh(new THREE.PlaneGeometry(garW, plotSize/2), matAsphalt, false, true);
            driveway.rotation.x = -Math.PI / 2;
            driveway.position.set(bW/2 - gfBaseW/2, 0.02, baseZ + gfBaseD/2 + plotSize/4);

            // 3. Ground Floor - Wood Accent (left side)
            const woodBaseW = bW * 0.4;
            const woodBaseD = bD * 0.5;
            const woodBase = createMesh(new THREE.BoxGeometry(woodBaseW, flHeight, woodBaseD), matWood);
            woodBase.position.set(-bW/2 + woodBaseW/2, flHeight/2, baseZ + gfBaseD/2 - woodBaseD/2);

            addWindow(1.2, 2.2, -bW/2 + woodBaseW/2 - 1.0, 2.2/2, baseZ + gfBaseD/2 + 0.01);
            addWindow(1.0, 1.0, -bW/2 + woodBaseW/2 + 0.5, 1.0/2 + 0.8, baseZ + gfBaseD/2 + 0.01);

            // 4. First Floor - Massive White Overhang Volume
            if (computedFloors > 1) {
              const ffW = bW; 
              const ffD = bD * 0.6;
              const ffMain = createMesh(new THREE.BoxGeometry(ffW, flHeight, ffD), matPlasterWhite);
              ffMain.position.set(0, flHeight + flHeight/2, baseZ - gfBaseD/2 + ffD/2);

              const ffProjW = bW * 0.4;
              const ffProjD = bD * 0.4;
              const ffProj = createMesh(new THREE.BoxGeometry(ffProjW, flHeight, ffProjD), matPlasterWhite);
              ffProj.position.set(-bW/2 + ffProjW/2, flHeight + flHeight/2, baseZ + ffD/2 + ffProjD/2 - 0.5);

              // 5. Large Terrace on top of wood base
              const terraceW = bW * 0.6;
              const terraceD = bD * 0.6;
              const terraceDeck = createMesh(new THREE.BoxGeometry(terraceW, 0.2, terraceD), matWood);
              terraceDeck.position.set(bW/2 - terraceW/2 - bW*0.1, flHeight + 0.1, baseZ + gfBaseD/2 - terraceD/2 + 0.5);

              addWindow(terraceW * 0.6, flHeight * 0.7, bW/2 - terraceW/2 - bW*0.1, flHeight + (flHeight*0.7)/2, baseZ - gfBaseD/2 + ffD + 0.01);

              // 6. Flat Roof & Skylights
              const roof = createMesh(new THREE.BoxGeometry(ffW + 0.2, 0.3, ffD + 0.2), matRoof);
              roof.position.set(0, flHeight*2 + 0.15, baseZ - gfBaseD/2 + ffD/2);
              const roofProj = createMesh(new THREE.BoxGeometry(ffProjW + 0.2, 0.3, ffProjD + 0.2), matRoof);
              roofProj.position.set(-bW/2 + ffProjW/2, flHeight*2 + 0.15, baseZ + ffD/2 + ffProjD/2 - 0.5);

              addSkylight(1.5, 1.5, -ffW * 0.2, flHeight*2 + 0.3, baseZ - gfBaseD/2 + ffD/2);
              addSkylight(1.5, 1.5, ffW * 0.2, flHeight*2 + 0.3, baseZ - gfBaseD/2 + ffD/2);

              for (let i = 0; i < 3; i++) {
                  addWindow(0.5, 1.5, -bW/2 - 0.01, flHeight + 1.5, baseZ - 0.5 + i*1.0, Math.PI / 2);
              }
            }

            // 7. Architectural Pergola/Pathway on Far Left
            const pathW = 2.0;
            const pathway = createMesh(new THREE.PlaneGeometry(pathW, plotSize), matConcrete, false, true);
            pathway.rotation.x = -Math.PI / 2;
            pathway.position.set(-bW/2 - pathW, 0.03, 0);

            const pWallW = 0.5;
            const pWall = createMesh(new THREE.BoxGeometry(pWallW, flHeight + 0.5, 2.0), matPlasterGrey);
            pWall.position.set(-bW/2 - pathW - pWallW/2, (flHeight + 0.5)/2, baseZ + 1.0);

            for (let i = 0; i < 8; i++) {
                const slat = createMesh(new THREE.BoxGeometry(pathW, 0.1, 0.2), matDarkWood);
                slat.position.set(-bW/2 - pathW/2, flHeight + 0.4, baseZ + 0.2 + i*0.4);
            }

            break;
        }
    }

    setStats({
      landArea: sqft,
      footprint: computedFootprintSqFt,
      openArea: sqft - computedFootprintSqFt,
      floors: computedFloors,
      type: typName
    });

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      
      disposables.forEach(item => {
        if (item && typeof item.dispose === 'function') {
          item.dispose();
        }
      });
      scene.clear();
    };
  }, [landAreaSqFt, buildingType]);

  return (
    <div className="w-full h-full relative bg-[#E2E8F0] rounded-xl overflow-hidden shadow-inner border border-slate-200">
      {/* 3D Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-move absolute inset-0" />
      
      {/* Information Overlay */}
      <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md p-5 rounded-xl shadow-xl border border-slate-200 pointer-events-none min-w-[260px] z-10">
        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Architectural Generation
        </h4>
        
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center gap-6 border-b border-slate-100 pb-2">
            <span className="text-xs font-semibold text-slate-500">Total Land Area</span>
            <span className="text-sm font-black text-slate-800">{Math.round(stats.landArea).toLocaleString()} sq.ft</span>
          </div>
          <div className="flex justify-between items-center gap-6 border-b border-slate-100 pb-2">
            <span className="text-xs font-semibold text-slate-500">Building Footprint</span>
            <span className="text-sm font-black text-blue-600">{Math.round(stats.footprint).toLocaleString()} sq.ft</span>
          </div>
          <div className="flex justify-between items-center gap-6 border-b border-slate-100 pb-2">
            <span className="text-xs font-semibold text-slate-500">Open/Setback Area</span>
            <span className="text-sm font-bold text-green-600">{Math.round(stats.openArea).toLocaleString()} sq.ft</span>
          </div>
          <div className="flex justify-between items-center gap-6 pt-1">
            <span className="text-xs font-semibold text-slate-500">Building Type</span>
            <span className="text-xs font-bold text-slate-700 text-right max-w-[120px] leading-tight">{stats.type}</span>
          </div>
          <div className="flex justify-between items-center gap-6 pt-1">
            <span className="text-xs font-semibold text-slate-500">Number of Floors</span>
            <span className="text-xs font-bold text-slate-700">{stats.floors}</span>
          </div>
        </div>
      </div>

      {/* Control Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/40 text-white text-[10px] uppercase tracking-widest px-4 py-2 rounded-full backdrop-blur-md pointer-events-none z-10">
        Left Click: Rotate • Scroll: Zoom • Right Click: Pan
      </div>
    </div>
  );
}
