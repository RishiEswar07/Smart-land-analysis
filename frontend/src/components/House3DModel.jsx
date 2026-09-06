import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export default function House3DModel({ landAreaSqFt = 1500, buildingType = 'Individual House' }) {
  const mountRef = useRef(null)
  
  const [stats, setStats] = useState({
    landAreaSqFt: 0,
    landAreaSqm: 0,
    landAreaCents: 0,
    footprint: 0,
    openArea: 0,
    floors: 1,
    type: 'Individual House'
  })

  useEffect(() => {
    if (!mountRef.current) return

    const sqft = Number(landAreaSqFt) > 0 ? Number(landAreaSqFt) : 1500;
    const sqMeters = sqft * 0.092903;
    const cents = sqft / 435.6;
    const plotSize = Math.max(5, Math.min(Math.sqrt(sqMeters), 35)); 

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#E2E8F0');
    scene.fog = new THREE.FogExp2('#E2E8F0', 0.012);

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    
    camera.position.set(plotSize * 1.6, plotSize * 1.2 + 6, plotSize * 1.6);

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

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.65);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(plotSize * 1.5, plotSize * 2.5, plotSize * 1.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = plotSize * 6;
    sunLight.shadow.camera.left = -plotSize * 1.5;
    sunLight.shadow.camera.right = plotSize * 1.5;
    sunLight.shadow.camera.top = plotSize * 1.5;
    sunLight.shadow.camera.bottom = -plotSize * 1.5;
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

    // Materials
    const matGrass = new THREE.MeshStandardMaterial({ color: 0x76A035, roughness: 0.9 });
    const matConcrete = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.7 });
    const matPlasterWhite = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.9 });
    const matPlasterGrey = new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.85 });
    const matWood = new THREE.MeshStandardMaterial({ color: 0xB48455, roughness: 0.75 });
    const matDarkWood = new THREE.MeshStandardMaterial({ color: 0x4A3525, roughness: 0.8 });
    const matPitchedRoof = new THREE.MeshStandardMaterial({ color: 0x8E3B29, roughness: 0.6 });
    const matFlatRoof = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.9 });
    const matGlass = new THREE.MeshPhysicalMaterial({ 
      color: 0x2563EB, metalness: 0.8, roughness: 0.1, 
      transparent: true, opacity: 0.75, envMapIntensity: 1.0 
    });
    const matBlueGlass = new THREE.MeshPhysicalMaterial({ 
      color: 0x1D4ED8, metalness: 0.9, roughness: 0.1, 
      transparent: true, opacity: 0.85, envMapIntensity: 1.2 
    });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.4 });
    const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
    const matHospitalCross = new THREE.MeshStandardMaterial({ color: 0xDC2626, roughness: 0.4 });
    const matHelipadYellow = new THREE.MeshStandardMaterial({ color: 0xFACC15, roughness: 0.5 });
    const matBrick = new THREE.MeshStandardMaterial({ color: 0x994D38, roughness: 0.95 });

    // Ground Plot
    const groundGeo = new THREE.PlaneGeometry(plotSize, plotSize);
    const ground = createMesh(groundGeo, matGrass, false, true);
    ground.rotation.x = -Math.PI / 2;

    // Plot Border Line
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(plotSize, 0.05, plotSize));
    const borderMat = new THREE.LineBasicMaterial({ color: 0x1E3A8A, linewidth: 2 });
    disposables.push(borderGeo, borderMat);
    const plotBorder = new THREE.LineSegments(borderGeo, borderMat);
    plotBorder.position.set(0, 0.02, 0);
    scene.add(plotBorder);

    let computedFootprintSqFt = 0;
    let computedFloors = 1;
    let normType = (buildingType || '').toLowerCase();

    if (normType.includes('commercial')) {
      // ---------------- COMMERCIAL BUILDING ----------------
      const flHeight = 3.2;
      const coverage = 0.55;
      const footprint = sqMeters * coverage;
      computedFootprintSqFt = footprint * 10.7639;
      const bW = Math.min(plotSize * 0.7, Math.sqrt(footprint) * 1.3);
      const bD = Math.min(plotSize * 0.6, footprint / bW);
      computedFloors = Math.min(8, Math.max(3, Math.floor(sqMeters / 250)));
      const totalH = computedFloors * flHeight;
      const baseZ = -plotSize * 0.1;

      // Paved Plaza & Entrance
      const plaza = createMesh(new THREE.BoxGeometry(plotSize * 0.9, 0.05, plotSize * 0.4), matConcrete);
      plaza.position.set(0, 0.03, plotSize * 0.25);

      // Glass Curtain Tower
      const tower = createMesh(new THREE.BoxGeometry(bW, totalH, bD), matBlueGlass);
      tower.position.set(0, totalH / 2, baseZ);

      // Floor Concrete Slabs & Mullions
      for (let i = 1; i <= computedFloors; i++) {
        const slab = createMesh(new THREE.BoxGeometry(bW + 0.3, 0.2, bD + 0.3), matConcrete);
        slab.position.set(0, i * flHeight, baseZ);
      }

      // Modern Entrance Canopy & Pillars
      const canopyW = bW * 0.6;
      const canopy = createMesh(new THREE.BoxGeometry(canopyW, 0.2, 3), matFrame);
      canopy.position.set(0, flHeight, baseZ + bD / 2 + 1.5);
      
      const p1 = createMesh(new THREE.CylinderGeometry(0.15, 0.15, flHeight), matFrame);
      p1.position.set(-canopyW / 2 + 0.3, flHeight / 2, baseZ + bD / 2 + 2.5);
      const p2 = createMesh(new THREE.CylinderGeometry(0.15, 0.15, flHeight), matFrame);
      p2.position.set(canopyW / 2 - 0.3, flHeight / 2, baseZ + bD / 2 + 2.5);

      // Rooftop HVAC & Mechanical Units
      const hvac1 = createMesh(new THREE.BoxGeometry(bW * 0.25, 1.2, bD * 0.25), matPlasterGrey);
      hvac1.position.set(-bW * 0.2, totalH + 0.6, baseZ);
      const hvac2 = createMesh(new THREE.BoxGeometry(bW * 0.2, 1.0, bD * 0.2), matPlasterGrey);
      hvac2.position.set(bW * 0.2, totalH + 0.5, baseZ);

    } else if (normType.includes('apartment')) {
      // ---------------- APARTMENT COMPLEX ----------------
      const flHeight = 2.8;
      const coverage = 0.50;
      const footprint = sqMeters * coverage;
      computedFootprintSqFt = footprint * 10.7639;
      const bW = Math.min(plotSize * 0.75, Math.sqrt(footprint) * 1.2);
      const bD = Math.min(plotSize * 0.6, footprint / bW);
      computedFloors = Math.min(7, Math.max(3, Math.floor(sqMeters / 200)));
      const totalH = computedFloors * flHeight;
      const baseZ = -plotSize * 0.1;

      // Main Tower Structure
      const apt = createMesh(new THREE.BoxGeometry(bW, totalH, bD), matPlasterWhite);
      apt.position.set(0, totalH / 2, baseZ);

      // Balconies with Glass/Metal Railings on Each Upper Floor
      for (let i = 1; i < computedFloors; i++) {
        const balH = i * flHeight;
        // Balcony slab
        const bal = createMesh(new THREE.BoxGeometry(bW * 0.85, 0.15, 1.2), matConcrete);
        bal.position.set(0, balH, baseZ + bD / 2 + 0.6);
        // Glass railing
        const railing = createMesh(new THREE.BoxGeometry(bW * 0.85, 0.8, 0.05), matGlass);
        railing.position.set(0, balH + 0.45, baseZ + bD / 2 + 1.15);
      }

      // Ground Floor Lobby & Entry
      const lobby = createMesh(new THREE.BoxGeometry(bW * 0.5, flHeight, 1.5), matGlass);
      lobby.position.set(0, flHeight / 2, baseZ + bD / 2 + 0.75);

      // Rooftop Pergola & Elevator Bulkhead
      const elevatorCore = createMesh(new THREE.BoxGeometry(bW * 0.3, 2.0, bD * 0.3), matPlasterGrey);
      elevatorCore.position.set(-bW * 0.2, totalH + 1.0, baseZ);

      // Access Road & Parking
      const road = createMesh(new THREE.PlaneGeometry(plotSize * 0.9, 4), matAsphalt, false, true);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.02, plotSize * 0.35);

    } else if (normType.includes('school')) {
      // ---------------- SCHOOL CAMPUS ----------------
      const flHeight = 3.0;
      const coverage = 0.42;
      const footprint = sqMeters * coverage;
      computedFootprintSqFt = footprint * 10.7639;
      const bW = Math.min(plotSize * 0.85, Math.sqrt(footprint) * 2.2);
      const bD = footprint / bW;
      computedFloors = Math.min(4, Math.max(2, Math.floor(sqMeters / 400)));
      const totalH = computedFloors * flHeight;
      const baseZ = -plotSize * 0.25;

      // Central Main Wing
      const mainWing = createMesh(new THREE.BoxGeometry(bW, totalH, bD), matBrick);
      mainWing.position.set(0, totalH / 2, baseZ);

      // Clock / Pediment Tower in Center
      const towerH = 3.0;
      const clockTower = createMesh(new THREE.BoxGeometry(bW * 0.2, towerH, bD * 1.1), matPlasterWhite);
      clockTower.position.set(0, totalH + towerH / 2, baseZ);

      // Side Wings (U-Shape Campus)
      const wingD = plotSize * 0.35;
      const wingW = bD * 1.3;
      const leftWing = createMesh(new THREE.BoxGeometry(wingW, totalH, wingD), matBrick);
      leftWing.position.set(-bW / 2 + wingW / 2, totalH / 2, baseZ + bD / 2 + wingD / 2);

      const rightWing = createMesh(new THREE.BoxGeometry(wingW, totalH, wingD), matBrick);
      rightWing.position.set(bW / 2 - wingW / 2, totalH / 2, baseZ + bD / 2 + wingD / 2);

      // Central Courtyard Assembly Ground
      const courtW = bW - wingW * 2 - 0.5;
      const court = createMesh(new THREE.PlaneGeometry(courtW, wingD), matConcrete, false, true);
      court.rotation.x = -Math.PI / 2;
      court.position.set(0, 0.02, baseZ + bD / 2 + wingD / 2);

      // Flagpole
      const pole = createMesh(new THREE.CylinderGeometry(0.05, 0.05, 5), matFrame);
      pole.position.set(0, 2.5, baseZ + bD / 2 + wingD * 0.6);

      // Sports Turf Field
      const field = createMesh(new THREE.PlaneGeometry(plotSize * 0.85, plotSize * 0.25), matGrass, false, true);
      field.rotation.x = -Math.PI / 2;
      field.position.set(0, 0.03, plotSize * 0.32);

    } else if (normType.includes('hospital')) {
      // ---------------- HOSPITAL COMPLEX ----------------
      const flHeight = 3.6;
      const coverage = 0.58;
      const footprint = sqMeters * coverage;
      computedFootprintSqFt = footprint * 10.7639;
      const bW = Math.min(plotSize * 0.8, Math.sqrt(footprint) * 1.8);
      const bD = footprint / bW;
      computedFloors = Math.min(6, Math.max(3, Math.floor(sqMeters / 600)));
      const totalH = computedFloors * flHeight;
      const baseZ = -plotSize * 0.12;

      // Hospital Main Block
      const mainBlock = createMesh(new THREE.BoxGeometry(bW, totalH, bD), matPlasterWhite);
      mainBlock.position.set(0, totalH / 2, baseZ);

      // Medical Red Cross Emblem on Facade
      const crossV = createMesh(new THREE.BoxGeometry(0.8, 2.8, 0.2), matHospitalCross);
      crossV.position.set(0, totalH - 1.5, baseZ + bD / 2 + 0.11);
      const crossH = createMesh(new THREE.BoxGeometry(2.8, 0.8, 0.2), matHospitalCross);
      crossH.position.set(0, totalH - 1.5, baseZ + bD / 2 + 0.11);

      // Emergency Ambulance Bay Canopy
      const bayW = bW * 0.45;
      const bayRoof = createMesh(new THREE.BoxGeometry(bayW, 0.3, 4.5), matPlasterGrey);
      bayRoof.position.set(0, flHeight, baseZ + bD / 2 + 2.25);

      const col1 = createMesh(new THREE.CylinderGeometry(0.2, 0.2, flHeight), matConcrete);
      col1.position.set(-bayW / 2 + 0.4, flHeight / 2, baseZ + bD / 2 + 4.0);
      const col2 = createMesh(new THREE.CylinderGeometry(0.2, 0.2, flHeight), matConcrete);
      col2.position.set(bayW / 2 - 0.4, flHeight / 2, baseZ + bD / 2 + 4.0);

      // Ambulance Driveway Loop
      const loop = createMesh(new THREE.PlaneGeometry(plotSize * 0.9, 8), matAsphalt, false, true);
      loop.rotation.x = -Math.PI / 2;
      loop.position.set(0, 0.02, baseZ + bD / 2 + 4.5);

      // Rooftop Helipad with Yellow 'H'
      const heliPad = createMesh(new THREE.CylinderGeometry(bW * 0.22, bW * 0.22, 0.2, 32), matConcrete);
      heliPad.position.set(bW * 0.25, totalH + 0.1, baseZ);

      const hBarV1 = createMesh(new THREE.BoxGeometry(0.3, 0.05, 1.8), matHelipadYellow);
      hBarV1.position.set(bW * 0.25 - 0.6, totalH + 0.22, baseZ);
      const hBarV2 = createMesh(new THREE.BoxGeometry(0.3, 0.05, 1.8), matHelipadYellow);
      hBarV2.position.set(bW * 0.25 + 0.6, totalH + 0.22, baseZ);
      const hBarH = createMesh(new THREE.BoxGeometry(1.2, 0.05, 0.3), matHelipadYellow);
      hBarH.position.set(bW * 0.25, totalH + 0.22, baseZ);

    } else {
      // ---------------- INDIVIDUAL / RESIDENTIAL HOUSE ----------------
      const flHeight = 3.0;
      const coverage = 0.42;
      const footprint = sqMeters * coverage;
      computedFootprintSqFt = footprint * 10.7639;
      computedFloors = sqMeters > 90 ? 2 : 1;
      const bW = Math.min(plotSize * 0.7, Math.sqrt(footprint) * 1.2);
      const bD = Math.min(plotSize * 0.6, footprint / bW);
      const totalH = computedFloors * flHeight;
      const baseZ = -plotSize * 0.05;

      // Ground Floor Body
      const houseBody = createMesh(new THREE.BoxGeometry(bW, totalH, bD), matPlasterWhite);
      houseBody.position.set(0, totalH / 2, baseZ);

      // Pitched / Gabled Sloped Roof
      const roofH = 1.8;
      const roofGeo = new THREE.ConeGeometry(Math.max(bW, bD) * 0.75, roofH, 4);
      const roof = createMesh(roofGeo, matPitchedRoof);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(0, totalH + roofH / 2, baseZ);

      // Brick Chimney
      const chimney = createMesh(new THREE.BoxGeometry(0.8, roofH + 1.2, 0.8), matBrick);
      chimney.position.set(bW * 0.25, totalH + roofH / 2, baseZ - bD * 0.2);

      // Front Wooden Porch & Entrance Door
      const porchW = bW * 0.45;
      const porchD = 1.8;
      const porchFloor = createMesh(new THREE.BoxGeometry(porchW, 0.15, porchD), matWood);
      porchFloor.position.set(0, 0.08, baseZ + bD / 2 + porchD / 2);

      const porchRoof = createMesh(new THREE.BoxGeometry(porchW + 0.2, 0.15, porchD + 0.2), matPitchedRoof);
      porchRoof.position.set(0, 2.4, baseZ + bD / 2 + porchD / 2);

      const post1 = createMesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), matDarkWood);
      post1.position.set(-porchW / 2 + 0.15, 1.2, baseZ + bD / 2 + porchD - 0.15);
      const post2 = createMesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), matDarkWood);
      post2.position.set(porchW / 2 - 0.15, 1.2, baseZ + bD / 2 + porchD - 0.15);

      // Entrance Door
      const door = createMesh(new THREE.BoxGeometry(1.0, 2.1, 0.08), matDarkWood);
      door.position.set(0, 1.05, baseZ + bD / 2 + 0.04);

      // Front Stone Walkway & Garden Area
      const walkway = createMesh(new THREE.PlaneGeometry(1.6, plotSize * 0.38), matConcrete, false, true);
      walkway.rotation.x = -Math.PI / 2;
      walkway.position.set(0, 0.02, baseZ + bD / 2 + porchD + (plotSize * 0.38) / 2);
    }

    setStats({
      landAreaSqFt: sqft,
      landAreaSqm: sqMeters,
      landAreaCents: cents,
      footprint: computedFootprintSqFt,
      openArea: Math.max(sqft - computedFootprintSqFt, 0),
      floors: computedFloors,
      type: buildingType || 'Individual House'
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
      <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-xl border border-slate-200 pointer-events-none min-w-[280px] z-10">
        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
          Procedural 3D Architectural Model
        </h4>
        
        <div className="flex flex-col gap-2.5 text-xs">
          <div className="flex justify-between items-center gap-4 border-b border-slate-100 pb-2">
            <span className="font-semibold text-slate-500">Parcel Area</span>
            <div className="text-right">
              <span className="font-black text-slate-800">{Math.round(stats.landAreaSqFt).toLocaleString()} sq.ft</span>
              <span className="block text-[10px] text-slate-400">({Math.round(stats.landAreaSqm).toLocaleString()} m² / {stats.landAreaCents.toFixed(2)} cents)</span>
            </div>
          </div>
          <div className="flex justify-between items-center gap-4 border-b border-slate-100 pb-2">
            <span className="font-semibold text-slate-500">Building Footprint</span>
            <span className="font-black text-blue-600">{Math.round(stats.footprint).toLocaleString()} sq.ft</span>
          </div>
          <div className="flex justify-between items-center gap-4 border-b border-slate-100 pb-2">
            <span className="font-semibold text-slate-500">Open / Setback Area</span>
            <span className="font-bold text-emerald-600">{Math.round(stats.openArea).toLocaleString()} sq.ft</span>
          </div>
          <div className="flex justify-between items-center gap-4 border-b border-slate-100 pb-2">
            <span className="font-semibold text-slate-500">Building Type</span>
            <span className="font-bold text-slate-700 text-right">{stats.type}</span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="font-semibold text-slate-500">Procedural Floors</span>
            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs">{stats.floors} {stats.floors === 1 ? 'Floor' : 'Floors'}</span>
          </div>
        </div>
      </div>

      {/* Conceptual Disclaimer & Interaction Hint */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-col sm:flex-row items-center justify-between gap-2 pointer-events-none z-10">
        <div className="bg-slate-900/80 text-slate-300 text-[10px] px-3 py-1.5 rounded-lg backdrop-blur-md border border-slate-700">
          💡 Procedural 3D conceptual visualization scaled to parcel area. Official blueprint requires structural survey.
        </div>
        <div className="bg-blue-600/90 text-white text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg backdrop-blur-md shadow">
          Left Drag: Rotate • Scroll: Zoom • Right Drag: Pan
        </div>
      </div>
    </div>
  );
}
