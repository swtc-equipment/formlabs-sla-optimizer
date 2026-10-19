import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
// @ts-ignore
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { MarkingType, OptimizationWeights, GeometryStats } from '../types';

interface Viewer3DProps {
  file: File;
  markingMode: MarkingType;
  brushSize: number;
  showOptimized: boolean;
  weights: OptimizationWeights;
  flipOrientation?: boolean; 
  onRotationChange?: (x: number, y: number, z: number) => void;
  onGeometryLoaded?: (stats: GeometryStats) => void;
}

const buildAdjacencyMap = (geometry: THREE.BufferGeometry): number[][] => {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return [];

  const count = posAttr.count;
  const faceCount = count / 3;

  const getVertexKey = (x: number, y: number, z: number): string => {
    return `${Math.round(x * 10000)},${Math.round(y * 10000)},${Math.round(z * 10000)}`;
  };

  const edgeToFaces = new Map<string, number[]>();

  for (let f = 0; f < faceCount; f++) {
    const i1 = f * 3;
    const i2 = f * 3 + 1;
    const i3 = f * 3 + 2;

    const v1 = getVertexKey(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = getVertexKey(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    const v3 = getVertexKey(posAttr.getX(i3), posAttr.getY(i3), posAttr.getZ(i3));

    const edges = [
      v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`,
      v2 < v3 ? `${v2}_${v3}` : `${v3}_${v2}`,
      v3 < v1 ? `${v3}_${v1}` : `${v1}_${v3}`
    ];

    for (const edge of edges) {
      let list = edgeToFaces.get(edge);
      if (!list) {
        list = [];
        edgeToFaces.set(edge, list);
      }
      list.push(f);
    }
  }

  const faceAdjacency: number[][] = Array.from({ length: faceCount }, () => []);

  for (const faces of edgeToFaces.values()) {
    if (faces.length > 1) {
      for (let i = 0; i < faces.length; i++) {
        const f1 = faces[i];
        for (let j = 0; j < faces.length; j++) {
          if (i !== j) {
            const f2 = faces[j];
            if (!faceAdjacency[f1].includes(f2)) {
              faceAdjacency[f1].push(f2);
            }
          }
        }
      }
    }
  }

  return faceAdjacency;
};

export interface Viewer3DHandle {
  exportSTL: () => void;
  getSnapshot: () => string;
  getMultiViewSnapshots: () => { iso: string, front: string, side: string, top: string };
  clearMarkings: () => void;
}

const Viewer3D = forwardRef<Viewer3DHandle, Viewer3DProps>(({ file, markingMode, brushSize, showOptimized, weights, flipOrientation = false, onRotationChange, onGeometryLoaded }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const brushPreviewRef = useRef<THREE.Mesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  const globalLongAxisRef = useRef(new THREE.Vector3(0,0,1)); 

  const markingModeRef = useRef(markingMode);
  const brushSizeRef = useRef(brushSize);
  const isOptimizedRef = useRef(showOptimized);
  const weightsRef = useRef(weights);
  const flipOrientationRef = useRef(flipOrientation);
  const faceAdjacencyRef = useRef<number[][] | null>(null);

  useImperativeHandle(ref, () => ({
    exportSTL: () => {
      if (!meshRef.current) return;
      const exporter = new STLExporter();
      const result = exporter.parse(meshRef.current, { binary: true });
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `optimized_${file.name}`;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    getSnapshot: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return "";
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      return rendererRef.current.domElement.toDataURL("image/png");
    },
    getMultiViewSnapshots: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !meshRef.current) {
        return { iso: "", front: "", side: "", top: "" };
      }

      const originalPos = cameraRef.current.position.clone();
      const originalRot = cameraRef.current.rotation.clone();
      
      const box = new THREE.Box3().setFromObject(meshRef.current);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = maxDim * 2;

      const takeShot = (x: number, y: number, z: number) => {
        if (!cameraRef.current || !sceneRef.current || !rendererRef.current) return "";
        cameraRef.current.position.set(center.x + x, center.y + y, center.z + z);
        cameraRef.current.lookAt(center);
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        return rendererRef.current.domElement.toDataURL("image/png");
      };

      const iso = takeShot(dist, -dist, dist);
      const front = takeShot(0, -dist, 0);
      const side = takeShot(dist, 0, 0);
      const top = takeShot(0, 0, dist);

      cameraRef.current.position.copy(originalPos);
      cameraRef.current.rotation.copy(originalRot);
      controlsRef.current?.update();
      rendererRef.current.render(sceneRef.current, cameraRef.current);

      return { iso, front, side, top };
    },
    clearMarkings: () => {
      if (meshRef.current && meshRef.current.geometry.attributes.marker) {
        const markerAttr = meshRef.current.geometry.attributes.marker as THREE.BufferAttribute;
        markerAttr.array.fill(0);
        markerAttr.needsUpdate = true;
      }
    }
  }));

  useEffect(() => {
    markingModeRef.current = markingMode;
    brushSizeRef.current = brushSize;
    isOptimizedRef.current = showOptimized;
    weightsRef.current = weights;
    flipOrientationRef.current = flipOrientation;
    
    if (brushPreviewRef.current) {
      brushPreviewRef.current.visible = markingMode !== MarkingType.NONE && !showOptimized;
    }

    if (controlsRef.current) {
      const inMarkingMode = markingMode !== MarkingType.NONE && !showOptimized;
      controlsRef.current.enableRotate = !inMarkingMode;
      controlsRef.current.enablePan = true;
      controlsRef.current.enableZoom = true;
    }

    if (meshRef.current) {
      if (showOptimized) {
        applySequentialOptimization(meshRef.current, weights, flipOrientation);
      } else {
        meshRef.current.rotation.set(0, 0, 0);
        meshRef.current.quaternion.identity();
        if (onRotationChange) onRotationChange(0, 0, 0);
      }
    }
  }, [markingMode, brushSize, showOptimized, weights, flipOrientation]);

  // --- Optimization Logic ---
  const calculateHoleAxis = (geometry: THREE.BufferGeometry): THREE.Vector3 | null => {
    const markers = geometry.attributes.marker.array;
    const normals = geometry.attributes.normal.array;
    const count = geometry.attributes.position.count;
    
    let hasHoleMarks = false;
    const scores = { x: 0, y: 0, z: 0 };
    const stride = 3; 
    
    for (let i = 0; i < count; i += stride) {
      if (markers[i] === MarkingType.CRITICAL_HOLE) {
        hasHoleMarks = true;
        const nx = normals[i * 3];
        const ny = normals[i * 3 + 1];
        const nz = normals[i * 3 + 2];
        scores.x += nx * nx;
        scores.y += ny * ny;
        scores.z += nz * nz;
      }
    }

    if (!hasHoleMarks) return null;
    if (scores.z <= scores.x && scores.z <= scores.y) return new THREE.Vector3(0, 0, 1);
    if (scores.y <= scores.x && scores.y <= scores.z) return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(1, 0, 0);
  };

  const applySequentialOptimization = (mesh: THREE.Mesh, w: OptimizationWeights, flip: boolean) => {
    const holeAxis = calculateHoleAxis(mesh.geometry) || globalLongAxisRef.current;
    const longAxis = globalLongAxisRef.current;

    const vC = flip ? longAxis.clone().negate() : longAxis.clone();
    const vD = flip ? holeAxis.clone().negate() : holeAxis.clone();

    const targetAxis = new THREE.Vector3().copy(vC).lerp(vD, w.holeAccuracy).normalize();
    const qVertical = new THREE.Quaternion().setFromUnitVectors(targetAxis, new THREE.Vector3(0,0,1));

    const maxTilt = Math.PI / 4; 
    const currentTilt = maxTilt * (1 - w.holeAccuracy);
    const qTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(currentTilt, currentTilt, 0));
    const qBase = qTilt.multiply(qVertical);
    let qCurrent = qBase.clone();

    if (w.userMarking > 0.01 && mesh.geometry.attributes.marker) {
      const { avgMarkedNormal, hasMarks } = getAverageMarkedNormal(mesh.geometry, MarkingType.MINIMIZE_SUPPORT);
      if (hasMarks) {
        const currentNormalWorld = avgMarkedNormal.clone().applyQuaternion(qCurrent);
        if (currentNormalWorld.z < -0.2) {
          const qTargetB = new THREE.Quaternion().setFromUnitVectors(avgMarkedNormal, new THREE.Vector3(0, 0, 1));
          qCurrent.slerp(qTargetB, w.userMarking);
        }
      }
    }

    if (w.printability > 0.1) {
       qCurrent.slerp(qVertical, w.printability * 0.2); 
    }

    mesh.quaternion.copy(qCurrent);

    if (onRotationChange) {
      const euler = new THREE.Euler().setFromQuaternion(qCurrent, 'XYZ');
      const toDeg = (rad: number) => {
        let deg = (rad * 180) / Math.PI;
        deg = deg % 360;
        if (deg > 180) deg -= 360;
        if (deg < -180) deg += 360;
        return Math.round(deg * 10) / 10; 
      };
      onRotationChange(toDeg(euler.x), toDeg(euler.y), toDeg(euler.z));
    }
  };

  const getAverageMarkedNormal = (geometry: THREE.BufferGeometry, type: MarkingType) => {
    const markers = geometry.attributes.marker.array;
    const normals = geometry.attributes.normal.array;
    const count = geometry.attributes.position.count;
    const avg = new THREE.Vector3(0, 0, 0);
    let markedCount = 0;
    const stride = 9; 
    
    for (let i = 0; i < count; i += stride) {
      if (markers[i] === type) {
        avg.x += normals[i * 3];
        avg.y += normals[i * 3 + 1];
        avg.z += normals[i * 3 + 2];
        markedCount++;
      }
    }
    
    if (markedCount > 0) avg.normalize();
    return { avgMarkedNormal: avg, hasMarks: markedCount > 0 };
  };

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    sceneRef.current = scene;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 100000); 
    camera.up.set(0, 0, 1); 
    camera.position.set(200, -200, 200); 
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const gridHelper = new THREE.GridHelper(400, 40, 0x222222, 0x151515);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(100);
    scene.add(axesHelper);

    const ringGeo = new THREE.RingGeometry(0.85, 1.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({ 
      color: 0x00f0ff, 
      side: THREE.DoubleSide, 
      transparent: true, 
      opacity: 0.8,
      depthTest: false 
    });
    const brushPreview = new THREE.Mesh(ringGeo, ringMat);
    brushPreview.renderOrder = 9999;
    brushPreview.visible = false;
    scene.add(brushPreview);
    brushPreviewRef.current = brushPreview;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    console.log("[Viewer3D] Loading File:", file.name);
    const loader = new STLLoader();
    const reader = new FileReader();
    let isMounted = true;
    
    reader.onload = (event) => {
      if (!isMounted || !event.target?.result) return;
      
      try {
        const geometry = loader.parse(event.target.result as ArrayBuffer);
        
        faceAdjacencyRef.current = buildAdjacencyMap(geometry);
        
        geometry.center();
        if (!geometry.attributes.normal) {
            geometry.computeVertexNormals();
        }
        
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        const size = new THREE.Vector3();
        box.getSize(size);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const safeMaxDim = (maxDim > 0 && isFinite(maxDim)) ? maxDim : 100;
        
        camera.near = Math.max(0.1, safeMaxDim / 1000);
        camera.far = Math.max(10000, safeMaxDim * 50);
        camera.updateProjectionMatrix();

        const center = box.getCenter(new THREE.Vector3());
        camera.position.set(safeMaxDim * 1.5, -safeMaxDim * 1.5, safeMaxDim * 1.5);
        camera.lookAt(center);
        
        controls.target.copy(center);
        controls.maxDistance = safeMaxDim * 10;
        controls.minDistance = safeMaxDim / 100;
        controls.update();

        const scaleFactor = Math.max(1, safeMaxDim / 200);
        gridHelper.scale.setScalar(scaleFactor);
        axesHelper.scale.setScalar(safeMaxDim * 0.2);

        if (onGeometryLoaded) {
          onGeometryLoaded({
            vertexCount: geometry.attributes.position.count,
            faceCount: geometry.attributes.position.count / 3,
            boundingBox: {
              min: { x: box.min.x, y: box.min.y, z: box.min.z },
              max: { x: box.max.x, y: box.max.y, z: box.max.z },
              size: { x: size.x, y: size.y, z: size.z }
            },
            volume: size.x * size.y * size.z,
            isWatertight: true,
            fileName: file.name
          });
        }

        const basisVectors = [
          { vec: new THREE.Vector3(1, 0, 0), len: size.x },
          { vec: new THREE.Vector3(0, 1, 0), len: size.y },
          { vec: new THREE.Vector3(0, 0, 1), len: size.z }
        ];
        const sortedByLen = [...basisVectors].sort((a, b) => b.len - a.len);
        globalLongAxisRef.current.copy(sortedByLen[0].vec);

        const count = geometry.attributes.position.count;
        const markers = new Float32Array(count); 
        geometry.setAttribute('marker', new THREE.BufferAttribute(markers, 1));

        const material = new THREE.ShaderMaterial({
          vertexShader: `
            attribute float marker;
            varying float vMarker;
            varying vec3 vNormal;
            void main() {
              vMarker = marker;
              vNormal = normalMatrix * normal;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying float vMarker;
            varying vec3 vNormal;
            void main() {
              vec3 color = vec3(0.65, 0.65, 0.67); 
              
              if (vMarker > 0.5 && vMarker < 1.5) color = vec3(0.2, 0.6, 1.0); // Blue (Minimize Support)
              if (vMarker > 1.5 && vMarker < 2.5) color = vec3(1.0, 0.6, 0.1); // Amber (Critical Hole)
              
              vec3 lightDir1 = normalize(vec3(0.5, 0.8, 1.0)); 
              vec3 lightDir2 = normalize(vec3(-0.5, -0.2, -1.0)); 
              
              float diff1 = max(dot(normalize(vNormal), lightDir1), 0.0);
              float diff2 = max(dot(normalize(vNormal), lightDir2), 0.0) * 0.4;
              
              float ambient = 0.6; 
              float light = ambient + diff1 + diff2;
              
              gl_FragColor = vec4(color * light, 1.0);
            }
          `,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        meshRef.current = mesh;

        const boxHelper = new THREE.BoxHelper(mesh, 0xffff00);
        (boxHelper.material as THREE.LineBasicMaterial).transparent = true;
        (boxHelper.material as THREE.LineBasicMaterial).opacity = 0.3;
        scene.add(boxHelper);

        if (showOptimized) {
          applySequentialOptimization(mesh, weights, flipOrientation);
        } else {
           if (onRotationChange) onRotationChange(0, 0, 0);
        }
      } catch (err) {
        console.error("Failed to parse STL:", err);
      }
    };

    reader.onerror = (err) => {
      console.error("FileReader error:", err);
    };

    reader.readAsArrayBuffer(file);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleInteraction = (event: PointerEvent) => {
       if (!rendererRef.current || !meshRef.current || !controlsRef.current || !cameraRef.current) return;
       
       const inMarkingMode = markingModeRef.current !== MarkingType.NONE && !isOptimizedRef.current;
       
       if (!inMarkingMode) {
         if (brushPreviewRef.current) brushPreviewRef.current.visible = false;
         return; 
       }

       const rect = rendererRef.current.domElement.getBoundingClientRect();
       mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
       mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

       raycaster.setFromCamera(mouse, cameraRef.current);
       const intersects = raycaster.intersectObject(meshRef.current);

       if (intersects.length > 0) {
        const intersect = intersects[0];
        const worldPoint = intersect.point;
        
        const camDistance = cameraRef.current.position.distanceTo(worldPoint);
        const worldRadius = (brushSizeRef.current / 800) * camDistance; 

        if (brushPreviewRef.current) {
          brushPreviewRef.current.position.copy(worldPoint);
          brushPreviewRef.current.quaternion.copy(cameraRef.current.quaternion);
          brushPreviewRef.current.scale.set(worldRadius, worldRadius, 1);
          brushPreviewRef.current.visible = true;
        }

        if (event.buttons === 1) {
          const geometry = meshRef.current.geometry;
          const posAttr = geometry.attributes.position;
          const markerAttr = geometry.attributes.marker;
          const radiusSq = worldRadius * worldRadius;
          const localPoint = meshRef.current.worldToLocal(worldPoint.clone());
          const markerVal = markingModeRef.current === MarkingType.ERASER ? MarkingType.NONE : markingModeRef.current;

          const hitNormal = intersect.face?.normal;
          if (!hitNormal) return;
          hitNormal.normalize(); 

          const camDirWorld = new THREE.Vector3();
          cameraRef.current.getWorldDirection(camDirWorld);
          const camDirLocal = camDirWorld.clone().applyQuaternion(meshRef.current.quaternion.clone().invert()).normalize();

          const thicknessThreshold = 0.045 / (meshRef.current.userData.originalScale || 1);

          const startFaceIndex = intersect.faceIndex;
          if (startFaceIndex !== undefined && faceAdjacencyRef.current) {
            const faceAdjacency = faceAdjacencyRef.current;
            const queue: number[] = [startFaceIndex];
            const visited = new Set<number>();
            visited.add(startFaceIndex);

            while (queue.length > 0) {
              const f = queue.shift()!;
              const i = f * 3;

              const v1x = posAttr.getX(i); const v1y = posAttr.getY(i); const v1z = posAttr.getZ(i);
              const v2x = posAttr.getX(i+1); const v2y = posAttr.getY(i+1); const v2z = posAttr.getZ(i+1);
              const v3x = posAttr.getX(i+2); const v3y = posAttr.getY(i+2); const v3z = posAttr.getZ(i+2);

              const cx = (v1x + v2x + v3x) / 3;
              const cy = (v1y + v2y + v3y) / 3;
              const cz = (v1z + v2z + v3z) / 3;

              const d1sq = (v1x - localPoint.x)**2 + (v1y - localPoint.y)**2 + (v1z - localPoint.z)**2;
              const d2sq = (v2x - localPoint.x)**2 + (v2y - localPoint.y)**2 + (v2z - localPoint.z)**2;
              const d3sq = (v3x - localPoint.x)**2 + (v3y - localPoint.y)**2 + (v3z - localPoint.z)**2;
              const dcsq = (cx - localPoint.x)**2 + (cy - localPoint.y)**2 + (cz - localPoint.z)**2;

              const isNear = d1sq < radiusSq || d2sq < radiusSq || d3sq < radiusSq || dcsq < radiusSq;
              if (isNear) {
                const ux = v2x - v1x; const uy = v2y - v1y; const uz = v2z - v1z;
                const wx = v3x - v1x; const wy = v3y - v1y; const wz = v3z - v1z;
                let nx = uy * wz - uz * wy;
                let ny = uz * wx - ux * wz;
                let nz = ux * wy - uy * wx;
                const nlen = Math.sqrt(nx*nx + ny*ny + nz*nz);
                if (nlen > 0) { nx /= nlen; ny /= nlen; nz /= nlen; }

                const dotCam = nx * camDirLocal.x + ny * camDirLocal.y + nz * camDirLocal.z;
                if (dotCam > 0.05) continue;

                const clickedDot = nx * hitNormal.x + ny * hitNormal.y + nz * hitNormal.z;
                if (clickedDot < 0.5) continue;

                markerAttr.setX(i, markerVal);
                markerAttr.setX(i + 1, markerVal);
                markerAttr.setX(i + 2, markerVal);

                const adj = faceAdjacency[f] || [];
                for (const nextFace of adj) {
                  if (!visited.has(nextFace)) {
                    visited.add(nextFace);
                    queue.push(nextFace);
                  }
                }
              }
            }
          } else {
            const minX = localPoint.x - worldRadius; const maxX = localPoint.x + worldRadius;
            const minY = localPoint.y - worldRadius; const maxY = localPoint.y + worldRadius;
            const minZ = localPoint.z - worldRadius; const maxZ = localPoint.z + worldRadius;

            for (let i = 0; i < posAttr.count; i += 3) {
              const v1x = posAttr.getX(i); const v1y = posAttr.getY(i); const v1z = posAttr.getZ(i);
              const v2x = posAttr.getX(i+1); const v2y = posAttr.getY(i+1); const v2z = posAttr.getZ(i+1);
              const v3x = posAttr.getX(i+2); const v3y = posAttr.getY(i+2); const v3z = posAttr.getZ(i+2);

              const triMinX = Math.min(v1x, v2x, v3x);
              const triMaxX = Math.max(v1x, v2x, v3x);
              const triMinY = Math.min(v1y, v2y, v3y);
              const triMaxY = Math.max(v1y, v2y, v3y);
              const triMinZ = Math.min(v1z, v2z, v3z);
              const triMaxZ = Math.max(v1z, v2z, v3z);

              if (triMaxX < minX || triMinX > maxX || triMaxY < minY || triMinY > maxY || triMaxZ < minZ || triMinZ > maxZ) continue;

              const ux = v2x - v1x; const uy = v2y - v1y; const uz = v2z - v1z;
              const wx = v3x - v1x; const wy = v3y - v1y; const wz = v3z - v1z;
              let nx = uy * wz - uz * wy;
              let ny = uz * wx - ux * wz;
              let nz = ux * wy - uy * wx;
              const nlen = Math.sqrt(nx*nx + ny*ny + nz*nz);
              if (nlen > 0) { nx /= nlen; ny /= nlen; nz /= nlen; }

              const dotCam = nx * camDirLocal.x + ny * camDirLocal.y + nz * camDirLocal.z;
              if (dotCam > 0.05) continue;

              const clickedDot = nx * hitNormal.x + ny * hitNormal.y + nz * hitNormal.z;
              if (clickedDot < 0.5) continue;

              const cx = (v1x + v2x + v3x) / 3;
              const cy = (v1y + v2y + v3y) / 3;
              const cz = (v1z + v2z + v3z) / 3;

              const d1sq = (v1x - localPoint.x)**2 + (v1y - localPoint.y)**2 + (v1z - localPoint.z)**2;
              const d2sq = (v2x - localPoint.x)**2 + (v2y - localPoint.y)**2 + (v2z - localPoint.z)**2;
              const d3sq = (v3x - localPoint.x)**2 + (v3y - localPoint.y)**2 + (v3z - localPoint.z)**2;
              const dcsq = (cx - localPoint.x)**2 + (cy - localPoint.y)**2 + (cz - localPoint.z)**2;

              if (d1sq < radiusSq || d2sq < radiusSq || d3sq < radiusSq || dcsq < radiusSq) {
                const dx = cx - localPoint.x;
                const dy = cy - localPoint.y;
                const dz = cz - localPoint.z;
                const distFromPlane = Math.abs(dx * hitNormal.x + dy * hitNormal.y + dz * hitNormal.z);
                const dCentroid = Math.sqrt(dcsq);
                const tangentDeviation = dCentroid * Math.sqrt((1 - clickedDot) / (1 + clickedDot));
                const maxAllowedDist = thicknessThreshold + tangentDeviation;

                if (distFromPlane < maxAllowedDist) {
                  const depthDiff = dx * camDirLocal.x + dy * camDirLocal.y + dz * camDirLocal.z;
                  if (depthDiff <= maxAllowedDist) {
                    markerAttr.setX(i, markerVal);
                    markerAttr.setX(i + 1, markerVal);
                    markerAttr.setX(i + 2, markerVal);
                  }
                }
              }
            }
          }
          markerAttr.needsUpdate = true;
        }
       } else {
         if (brushPreviewRef.current) brushPreviewRef.current.visible = false;
       }
    };

    const onPointerDown = (event: PointerEvent) => {
      handleInteraction(event);
    };

    const el = renderer.domElement;
    el.addEventListener('pointermove', handleInteraction);
    el.addEventListener('pointerdown', onPointerDown);

    const animate = () => {
      const frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      return frame;
    };
    const animId = animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false; 
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      el.removeEventListener('pointermove', handleInteraction);
      el.removeEventListener('pointerdown', onPointerDown);
      if (containerRef.current) containerRef.current.removeChild(el);
      
      if (meshRef.current) {
        meshRef.current.geometry.dispose();
        (meshRef.current.material as THREE.Material).dispose();
      }
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, [file]);

  return <div ref={containerRef} className="w-full h-full touch-none cursor-crosshair" />;
});

export default Viewer3D;
