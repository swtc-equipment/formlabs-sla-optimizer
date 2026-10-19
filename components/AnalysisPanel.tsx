import React from 'react';
import { AlertTriangle, ShieldCheck, Info, FileText, Download, Check, AlertCircle, EyeOff } from 'lucide-react';
import { RiskLevel, AnalysisReport, ActiveRules } from '../types';

interface AnalysisPanelProps {
  report: AnalysisReport;
  onExportPDF?: () => void;
  activeRules: ActiveRules;
  onToggleRule: (key: string) => void;
  autoJudgementEnabled: boolean;
  onToggleAutoJudgement: () => void;
  manualInputs: Record<string, string>;
  onManualInputChange: (key: string, value: string) => void;
}

const renderGear3D = (
  cx: number, 
  cy: number, 
  numTeeth = 10, 
  rOuter = 21, 
  rInner = 15.5, 
  thickness = 6, 
  fillClass: string, 
  strokeWidth: number, 
  isActive: boolean, 
  outerColor: string,
  rotationOffset = 0
) => {
  const points: { x: number; y: number; r: number; angle: number }[] = [];
  for (let i = 0; i < numTeeth; i++) {
    const offset = (i * 360) / numTeeth + rotationOffset;
    const angles = [
      { angle: offset + 0, r: rOuter },
      { angle: offset + 11, r: rOuter },
      { angle: offset + 15, r: rInner },
      { angle: offset + 29, r: rInner },
      { angle: offset + 33, r: rOuter },
    ];
    
    angles.forEach(({ angle, r }) => {
      const rad = (angle * Math.PI) / 180;
      const x = cx + r * Math.cos(rad);
      const y = cy + (r * Math.sin(rad)) * 0.5;
      points.push({ x, y, r, angle: angle % 360 });
    });
  }

  const topPath = "M " + points.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ") + " Z";

  const verticalLines: React.ReactNode[] = [];
  const bottomSegments: string[] = [];
  
  let currentSegment: string[] = [];

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    
    const isP1Front = p1.y > cy - 1;
    const isP2Front = p2.y > cy - 1;

    if (isP1Front) {
      verticalLines.push(
        <line 
          key={`v-${i}`} 
          x1={p1.x.toFixed(2)} 
          y1={p1.y.toFixed(2)} 
          x2={p1.x.toFixed(2)} 
          y2={(p1.y + thickness).toFixed(2)} 
          className={outerColor}
          strokeWidth="0.8"
        />
      );
    }

    if (isP1Front && isP2Front) {
      if (currentSegment.length === 0) {
        currentSegment.push(`M ${p1.x.toFixed(2)} ${(p1.y + thickness).toFixed(2)}`);
      }
      currentSegment.push(`L ${p2.x.toFixed(2)} ${(p2.y + thickness).toFixed(2)}`);
    } else {
      if (currentSegment.length > 0) {
        bottomSegments.push(currentSegment.join(" "));
        currentSegment = [];
      }
    }
  }
  if (currentSegment.length > 0) {
    bottomSegments.push(currentSegment.join(" "));
  }

  const bottomPath = bottomSegments.join(" ");

  return (
    <g>
      {/* Bottom Outline */}
      {bottomPath && <path d={bottomPath} className={outerColor} fill="none" strokeWidth={strokeWidth} />}
      {/* Vertical Lines */}
      {verticalLines}
      {/* Top Face */}
      <path d={topPath} className={outerColor} strokeWidth={strokeWidth} fill={fillClass} />
      {/* Center Hole */}
      <ellipse cx={cx} cy={cy} rx="5" ry="2.5" fill="#080c14" className={outerColor} strokeWidth="0.8" />
    </g>
  );
};

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  report,
  onExportPDF,
  activeRules,
  onToggleRule,
  autoJudgementEnabled,
  onToggleAutoJudgement,
  manualInputs,
  onManualInputChange
}) => {
  const [pressProgress, setPressProgress] = React.useState<number>(0);
  const [isPressing, setIsPressing] = React.useState<boolean>(false);
  const pressTimer = React.useRef<any>(null);
  const progressTimer = React.useRef<any>(null);

  const startPress = (e: React.MouseEvent | React.TouchEvent) => {
    setIsPressing(true);
    setPressProgress(0);
    
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (progressTimer.current) clearInterval(progressTimer.current);

    const startTime = Date.now();
    progressTimer.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / 5000) * 100);
      setPressProgress(progress);
      if (progress >= 100) {
        clearInterval(progressTimer.current);
      }
    }, 100);

    pressTimer.current = setTimeout(() => {
      onToggleAutoJudgement();
      setIsPressing(false);
      setPressProgress(0);
      if (progressTimer.current) clearInterval(progressTimer.current);
    }, 5000);
  };

  const cancelPress = () => {
    setIsPressing(false);
    setPressProgress(0);
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };
  const getRiskStyles = () => {
    switch (report.riskLevel) {
      case RiskLevel.LOW: return { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', Icon: ShieldCheck };
      case RiskLevel.MEDIUM: return { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', Icon: Info };
      case RiskLevel.HIGH: return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', Icon: AlertTriangle };
    }
  };

  const styles = getRiskStyles();
  const specs = report.specs;

  const getStatusBadge = (actual: number, limit: number, isLowerBound = true) => {
    const isPass = isLowerBound ? (actual >= limit) : (actual <= limit);
    if (isPass) {
      return (
        <span className="flex items-center gap-1 text-[10px] bg-green-500/15 border border-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-black max-h-[19px]">
          <Check size={10} /> 符合 (PASS)
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] bg-red-500/15 border border-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-black animate-pulse max-h-[19px]">
        <AlertCircle size={10} /> 警告 (FAIL)
      </span>
    );
  };

  // Helper to render high-fidelity Form 4 technical blueprint schematic diagrams
  const getSchematicSVG = (key: keyof ActiveRules, isActive: boolean) => {
    const baseColor = isActive ? "stroke-gray-500" : "stroke-gray-700";
    const highlightColor = isActive ? "stroke-gray-100" : "stroke-gray-600";
    const arrowColor = isActive ? "fill-blue-400 stroke-blue-400" : "fill-gray-600 stroke-gray-600";

    switch (key) {
      case 'supportedWall':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Blueprint mesh network grid lines */}
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
            
            {/* 1. Behind Faces (inside wall backs and floor back to provide occlusion depth) */}
            {/* Floor top surface */}
            <path d="M 25.5 43.9 L 88.5 69.1 L 120.0 56.5 L 57.0 31.3 Z" className={baseColor} strokeWidth="1" fill="#080c14" fillOpacity="0.5" />
            {/* Inner right face of Left Post (floor level to top) */}
            <path d="M 57.0 11.6 L 25.5 24.2 L 25.5 43.9 L 57.0 31.3 Z" className={baseColor} strokeWidth="1" fill="#080c14" fillOpacity="0.4" />
            {/* Inner left face of Right Post (floor level to top) */}
            <path d="M 120.0 36.8 L 88.5 49.4 L 88.5 69.1 L 120.0 56.5 Z" className={baseColor} strokeWidth="1" fill="#080c14" fillOpacity="0.4" />

            {/* 2. Supported Wall (Highlighted technical element centered inside the gap) */}
            {/* Front Face of the wall */}
            <path d="M 44.4 19.9 L 107.4 45.1 L 107.4 61.5 L 44.4 36.3 Z" className={highlightColor} strokeWidth="1.8" fill={isActive ? "rgba(59,130,246,0.15)" : "rgba(75,85,99,0.1)"} />
            {/* Top Face of the wall */}
            <path d="M 44.4 19.9 L 107.4 45.1 L 109.5 44.3 L 46.5 19.1 Z" className={highlightColor} strokeWidth="1.8" fill={isActive ? "rgba(96,165,250,0.3)" : "rgba(75,85,99,0.2)"} />

            {/* 3. Foreground U-Channel Columns and Front Faces (Occludes parts of floor & wall) */}
            {/* Left Post Outer Left Face */}
            <path d="M 15.0 20.0 L 46.5 7.4 L 46.5 33.6 L 15.0 46.2 Z" className={baseColor} strokeWidth="1" fill="#060910" />
            {/* Left Post Top Face */}
            <path d="M 46.5 7.4 L 57.0 11.6 L 25.5 24.2 L 15.0 20.0 Z" className={baseColor} strokeWidth="1" fill="#0a0f1a" />
            {/* Left Post Front Face */}
            <path d="M 15.0 20.0 L 25.5 24.2 L 25.5 50.4 L 15.0 46.2 Z" className={baseColor} strokeWidth="1" fill="#05080e" />

            {/* Right Post Outer Right Face */}
            <path d="M 130.5 41.0 L 99.0 53.6 L 99.0 79.8 L 130.5 67.2 Z" className={baseColor} strokeWidth="1" fill="#060910" />
            {/* Right Post Top Face */}
            <path d="M 120.0 36.8 L 130.5 41.0 L 99.0 53.6 L 88.5 49.4 Z" className={baseColor} strokeWidth="1" fill="#0a0f1a" />
            {/* Right Post Front Face */}
            <path d="M 88.5 49.4 L 99.0 53.6 L 99.0 79.8 L 88.5 75.6 Z" className={baseColor} strokeWidth="1" fill="#05080e" />

            {/* Front Bottom Connecting Wall */}
            <path d="M 25.5 43.9 L 88.5 69.1 L 88.5 75.6 L 25.5 50.4 Z" className={baseColor} strokeWidth="1" fill="#05080e" />

            {/* 4. Measurement Inward Facing Blue Arrowheads (Wedge pointers matching exact position) */}
            <polygon 
              points="55,29 68,27 61,33" 
              fill={isActive ? "#1e60f2" : "#4b5563"} 
              stroke={isActive ? "#3b82f6" : "#4b5563"} 
              strokeWidth="0.5" 
            />
            <polygon 
              points="93,29 80,31 87,24" 
              fill={isActive ? "#1e60f2" : "#4b5563"} 
              stroke={isActive ? "#3b82f6" : "#4b5563"} 
              strokeWidth="0.5" 
            />

            {/* Dimension Text Descriptor */}
            <text x="75" y="74" textAnchor="middle" fill={isActive ? "#60a5fa" : "#4b5563"} className="text-[7.5px] font-black font-mono tracking-wider">T-WALL</text>
          </svg>
        );
      case 'unsupportedWall':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Blueprint mesh network grid lines */}
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            
            {/* 1. Base Platform Block */}
            {/* Base block top surface */}
            <path d="M 20 50 L 88 66 L 124 54 L 56 38 Z" className={baseColor} strokeWidth="1" fill="#080c14" fillOpacity="0.4" />
            {/* Base block front-left face */}
            <path d="M 20 50 L 88 66 L 88 74 L 20 58 Z" className={baseColor} strokeWidth="1" fill="#05080e" />
            {/* Base block front-right face */}
            <path d="M 88 66 L 124 54 L 124 62 L 88 74 Z" className={baseColor} strokeWidth="1" fill="#060910" />

            {/* 2. Back Wall (drawn first for occlusion) */}
            {/* Back wall front face */}
            <path d="M 46 7 L 114 23 L 114 58 L 46 42 Z" className={baseColor} strokeWidth="1" fill="#080c14" />
            {/* Back wall top face */}
            <path d="M 46 7 L 114 23 L 117 22 L 49 6 Z" className={baseColor} strokeWidth="1" fill="#0a0f1a" />
            {/* Back wall right edge face */}
            <path d="M 114 23 L 117 22 L 117 57 L 114 58 Z" className={baseColor} strokeWidth="1" fill="#05080e" />

            {/* 3. Front Wall (highlighted element, drawn second so its solid fill occludes the back wall) */}
            {/* Front wall front face with solid background to hide covered back wall parts */}
            <path d="M 28 13 L 96 29 L 96 64 L 28 48 Z" className={highlightColor} strokeWidth="1.5" fill="#080c14" />
            {/* Highlight overlay for active styling */}
            <path d="M 28 13 L 96 29 L 96 64 L 28 48 Z" stroke="none" fill={isActive ? "rgba(59,130,246,0.12)" : "rgba(100,116,139,0.06)"} />
            
            {/* Front wall top face */}
            <path d="M 28 13 L 96 29 L 99 28 L 31 12 Z" className={highlightColor} strokeWidth="1.5" fill={isActive ? "rgba(96,165,250,0.3)" : "rgba(75,85,99,0.2)"} />
            
            {/* Front wall right edge face */}
            <path d="M 96 29 L 99 28 L 99 63 L 96 64 Z" className={highlightColor} strokeWidth="1.5" fill="#05080e" />

            {/* 4. Opposing Blue Wedges pointing at the front wall thickness at top */}
            <polygon 
              points="52,19 60,20.5 53,27" 
              className={arrowColor}
              strokeWidth="0.5" 
            />
            <polygon 
              points="70,13 63,19.5 71,21" 
              className={arrowColor}
              strokeWidth="0.5" 
            />

            {/* Dimension Text Descriptor */}
            <text x="72" y="79" textAnchor="middle" fill={isActive ? "#60a5fa" : "#4b5563"} className="text-[7.5px] font-black font-mono tracking-wider">U-WALL</text>
          </svg>
        );
      case 'hole':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            {/* Isometric plate perspective */}
            <path d="M 22 30 L 65 15 L 122 35 L 80 50 Z" className={baseColor} strokeWidth="1" />
            <path d="M 22 30 L 22 38 L 80 58 L 80 50 Z" className={baseColor} strokeWidth="1" />
            <path d="M 122 35 L 122 43 L 80 58 L 80 50" className={baseColor} strokeWidth="1" />
            {/* Isometric Ellipse Hole */}
            <ellipse cx="72.5" cy="32.5" rx="17" ry="8.5" className={highlightColor} strokeWidth="2" />
            {/* Diameter Measure Line */}
            <line x1="55.5" y1="32.5" x2="89.5" y2="32.5" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="1.2" />
            <polygon points="55.5,32.5 61,29.5 61,35.5" className={arrowColor} />
            <polygon points="89.5,32.5 84,29.5 84,35.5" className={arrowColor} />
          </svg>
        );
      case 'clearance':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            
            {/* Left Gear (Base colored) */}
            {renderGear3D(42, 55, 10, 21, 15.5, 6, "#080c14", 1, isActive, baseColor, 0)}

            {/* Right Gear (Highly highlighted, rotated by 18 degrees to mesh perfectly) */}
            {renderGear3D(96, 55, 10, 21, 15.5, 6, isActive ? "rgba(59,130,246,0.15)" : "rgba(75,85,99,0.1)", 1.8, isActive, highlightColor, 18)}

            {/* Clearance Highlight Guide */}
            {/* Blue downward arrow (triangle matching exact gap boundaries 63 and 75) */}
            <polygon 
              points="69,25 63,16 75,16" 
              fill={isActive ? "#3b82f6" : "#4b5563"} 
              stroke={isActive ? "#3b82f6" : "#4b5563"} 
              strokeWidth="0.5" 
            />
            {/* Two vertical dashed lines from the triangle bounds pointing down to the gap */}
            <line 
              x1="63" y1="16" x2="63" y2="52" 
              stroke={isActive ? "#3b82f6" : "#4b5563"} 
              strokeWidth="1.2" 
              strokeDasharray="2 1.5" 
            />
            <line 
              x1="75" y1="16" x2="75" y2="52" 
              stroke={isActive ? "#3b82f6" : "#4b5563"} 
              strokeWidth="1.2" 
              strokeDasharray="2 1.5" 
            />

            {/* Dimension Text Descriptor */}
            <text x="69" y="11" textAnchor="middle" fill={isActive ? "#60a5fa" : "#4b5563"} className="text-[7.5px] font-black font-mono tracking-wider">CLEARANCE</text>
          </svg>
        );
      case 'overhang':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            {/* Support column */}
            <path d="M 22 68 L 48 68 L 48 20 L 22 20 Z" className={baseColor} strokeWidth="1" />
            {/* Ledge overhang */}
            <path d="M 48 20 L 118 20 L 118 32 L 48 32" className={highlightColor} strokeWidth="2" />
            {/* Cantilever span bounds */}
            <line x1="48" y1="52" x2="118" y2="52" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="1.2" />
            <line x1="48" y1="32" x2="48" y2="60" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="0.8" strokeDasharray="1.5 1.5" />
            <line x1="118" y1="32" x2="118" y2="60" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="0.8" strokeDasharray="1.5 1.5" />
            <polygon points="48,52 54,49 54,55" className={arrowColor} />
            <polygon points="118,52 112,49 112,55" className={arrowColor} />

            {/* Dimension Text Descriptor */}
            <text x="72" y="79" textAnchor="middle" fill={isActive ? "#60a5fa" : "#4b5563"} className="text-[7.5px] font-black font-mono tracking-wider">OVERHANG</text>
          </svg>
        );
      case 'overhangAngle':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            
            {/* Left anchor column block */}
            <path d="M 15 58 L 35 58 L 35 24 L 15 24 Z" className={baseColor} strokeWidth="1" fill="#080c14" />
            
            {/* Horizontal reference bottom surface */}
            <path d="M 35 58 L 115 58 M 35 54 L 115 54" className={baseColor} strokeWidth="1" />
            <path d="M 35 54 L 115 54 L 115 58 L 35 58 Z" className={baseColor} fill="#05080e" />

            {/* Angled overhanging leaf plate (e.g. 15 degrees angle) */}
            <path d="M 35 48 L 115 28 L 115 34 L 35 54 Z" className={highlightColor} strokeWidth="1.8" fill={isActive ? "rgba(59,130,246,0.18)" : "rgba(75,85,99,0.1)"} />
            
            {/* Angular Arc indicator pointing up from bottom reference to sloped plate */}
            <path d="M 98 54 A 65 65 0 0 0 102 36" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="1.2" />
            
            {/* Dimension Text Descriptor */}
            <text x="72" y="79" textAnchor="middle" fill={isActive ? "#60a5fa" : "#4b5563"} className="text-[7.5px] font-black font-mono tracking-wider">OH-ANGLE</text>
          </svg>
        );
      case 'bridgeSpan':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            {/* Base plate */}
            <path d="M 12 64 L 133 64 L 133 70 L 12 70 Z" className={baseColor} strokeWidth="1" />
            {/* Left and Right columns support */}
            <path d="M 22 64 L 44 64 L 44 32 L 22 32 Z" className={baseColor} strokeWidth="1" />
            <path d="M 101 64 L 123 64 L 123 32 L 101 32 Z" className={baseColor} strokeWidth="1" />
            {/* Horizontal Bridge spanned across */}
            <path d="M 44 32 L 101 32 L 101 44 L 44 44 Z" className={highlightColor} strokeWidth="1.8" fill={isActive ? "rgba(59,130,246,0.15)" : "rgba(75,85,99,0.05)"} />
            {/* Horizontal dimension line measuring span between pillars */}
            <line x1="44" y1="54" x2="101" y2="54" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="1.2" />
            <line x1="44" y1="44" x2="44" y2="60" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="0.8" strokeDasharray="1.5 1.5" />
            <line x1="101" y1="44" x2="101" y2="60" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="0.8" strokeDasharray="1.5 1.5" />
            <polygon points="44,54 50,51 50,57" className={arrowColor} />
            <polygon points="101,54 95,51 95,57" className={arrowColor} />
            
            {/* Dimension Text Descriptor */}
            <text x="72.5" y="79" textAnchor="middle" fill={isActive ? "#60a5fa" : "#4b5563"} className="text-[7.5px] font-black font-mono tracking-wider">BRIDGE SPAN</text>
          </svg>
        );
      case 'verticalWire7':
      case 'verticalWire30':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            {/* Base plate */}
            <path d="M 15 60 L 130 60 L 130 66 L 15 66 Z" className={baseColor} strokeWidth="1" />
            
            {/* Cylinder pin */}
            <path d="M 68 60 L 68 20 A 4.5 2 0 0 1 77 20 L 77 60 Z" className={highlightColor} strokeWidth="1" fill={isActive ? "rgba(59,130,246,0.15)" : "rgba(75,85,99,0.05)"} />
            <ellipse cx="72.5" cy="20" rx="4.5" ry="1.5" className={highlightColor} strokeWidth="1" fill={isActive ? "#3b82f6" : "#4b5563"} />
            
            {/* Side-by-side reference line measuring diameter */}
            <line x1="54" y1="36" x2="68" y2="36" stroke={isActive ? "#60a5fa" : "#4b5563"} strokeWidth="1" />
            <line x1="77" y1="36" x2="91" y2="36" stroke={isActive ? "#60a5fa" : "#4b5563"} strokeWidth="1" />
            <polygon points="68,36 62,33 62,39" className={arrowColor} />
            <polygon points="77,36 83,33 83,39" className={arrowColor} />

            {/* Height dimension on the right side */}
            <line x1="102" y1="20" x2="102" y2="60" stroke={isActive ? "#60a5fa" : "#4b5563"} strokeWidth="0.8" strokeDasharray="1.5 1.5" />
            <line x1="98" y1="20" x2="106" y2="20" stroke={isActive ? "#60a5fa" : "#4b5563"} strokeWidth="0.8" />
            <line x1="98" y1="60" x2="106" y2="60" stroke={isActive ? "#60a5fa" : "#4b5563"} strokeWidth="0.8" />
            
            {/* Dimension Text Descriptor */}
            <text x="72.5" y="79" textAnchor="middle" fill={isActive ? "#60a5fa" : "#4b5563"} className="text-[7.5px] font-black font-mono tracking-wider">VERT-WIRE</text>
          </svg>
        );
      case 'emboss':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            {/* Base platform */}
            <path d="M 15 54 L 130 54 L 130 64 L 15 64 Z" className={baseColor} strokeWidth="1" />
            {/* Embossed high-contrast line */}
            <path d="M 42 54 L 42 26 L 102 26 L 102 54" className={highlightColor} strokeWidth="2" />
            {/* Precision limit sizing arrows */}
            <line x1="42" y1="16" x2="102" y2="16" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="1.2" />
            <line x1="42" y1="26" x2="42" y2="12" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="0.8" />
            <line x1="102" y1="26" x2="102" y2="12" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="0.8" />
            <polygon points="42,16 48,13 48,19" className={arrowColor} />
            <polygon points="102,16 96,13 96,19" className={arrowColor} />
            <text x="72" y="38" textAnchor="middle" fill={isActive ? "#3b82f6" : "#4b5563"} className="text-[7.5px] font-bold font-mono">EMBOSS</text>
          </svg>
        );
      case 'engrave':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            {/* Engraved grooved block */}
            <path d="M 12 26 L 45 26 L 45 54 L 100 54 L 100 26 L 133 26" className={highlightColor} strokeWidth="2" />
            {/* Measure lines */}
            <line x1="45" y1="16" x2="100" y2="16" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="1.2" />
            <line x1="45" y1="26" x2="45" y2="12" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="0.8" />
            <line x1="100" y1="26" x2="100" y2="12" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="0.8" />
            <polygon points="45,16 51,13 51,19" className={arrowColor} />
            <polygon points="100,16 94,13 94,19" className={arrowColor} />
            <text x="72.5" y="42" textAnchor="middle" fill={isActive ? "#3b82f6" : "#4b5563"} className="text-[7.5px] font-bold font-mono">ENGRAVE</text>
          </svg>
        );
      case 'escapeHole':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            {/* Cup hollow profile */}
            <path d="M 25 58 L 48 58 L 48 24 L 97 24 L 97 58 L 120 58 L 120 68 L 25 68 Z" className={baseColor} strokeWidth="1.2" />
            <path d="M 36 68 L 36 34 L 109 34 L 109 68" stroke={isActive ? "#ef4444" : "#4b5563"} strokeWidth="1.2" strokeDasharray="2.5 1.5" />
            {/* Discharge/escape hole ports */}
            <path d="M 60 58 L 60 68 M 85 58 L 85 68" className={highlightColor} strokeWidth="1.8" />
            <path d="M 72.5 62 L 72.5 75" stroke={isActive ? "#3b82f6" : "#4b5563"} strokeWidth="1.2" strokeDasharray="1.5 1.5" />
            <polygon points="72.5,76 75,72 70,72" className={arrowColor} />
          </svg>
        );
      case 'watertight':
        return (
          <svg viewBox="0 0 145 82" className="w-full h-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0,20.5 H145 M0,41 H145 M0,61.5 H145 M36.25,0 V82 M72.5,0 V82 M108.75,0 V82" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            {/* Watertight diamond sphere mesh */}
            <polygon points="72.5,10 115,32 72.5,58 30,32" className={baseColor} strokeWidth="1" />
            <polygon points="72.5,10 94,32 72.5,58 51,32" className={highlightColor} strokeWidth="1.2" />
            <line x1="30" y1="32" x2="115" y2="32" className={baseColor} strokeWidth="0.8" strokeDasharray="2.5 2.5" />
            <line x1="72.5" y1="10" x2="72.5" y2="58" className={baseColor} strokeWidth="0.8" strokeDasharray="2.5 2.5" />
            <path d="M 72.5,21 Q 62.5,29 72.5,43 Q 82.5,29 72.5,21 Z" className={arrowColor} strokeWidth="1" fillOpacity="0.2" />
          </svg>
        );
      default:
        return null;
    }
  };

  // Helper for rendering toggle rows
  const labelMap: Record<string, { zh: string; en: string }> = {
    supportedWall: { zh: "受支撐壁厚", en: "Supported Wall" },
    unsupportedWall: { zh: "無支撐壁厚", en: "Unsupported Wall" },
    hole: { zh: "最小微小孔位直徑", en: "Min Hole" },
    clearance: { zh: "裝配部件間隙", en: "Clearance" },
    overhang: { zh: "無支撐懸空防垮跨距", en: "Unsupported Overhang" },
    overhangAngle: { zh: "最小無支撐懸空角度", en: "Unsupported Overhang Angle" },
    bridgeSpan: { zh: "最大水平支撐跨度/橋接", en: "Horizontal Span/Bridge" },
    verticalWire7: { zh: "最小垂直銷釘直徑 (高度 ≤ 7mm)", en: "Vertical Wire (H ≤ 7mm)" },
    verticalWire30: { zh: "最小垂直銷釘直徑 (高度 ≤ 30mm)", en: "Vertical Wire (H ≤ 30mm)" },
    emboss: { zh: "陽刻突出特色尺寸", en: "Embossed Detail" },
    engrave: { zh: "陰刻凹槽特色尺寸", en: "Engraved Detail" },
    escapeHole: { zh: "最小中空排水孔徑", en: "Drain Hole" },
    watertight: { zh: "幾何水密密封性", en: "Watertightness Check" },
  };

  const renderCheckRow = (
    key: keyof ActiveRules,
    title: string,
    reqText: string,
    actualText: string,
    badgeElement: React.ReactNode
  ) => {
    const isActive = activeRules[key];
    const labels = labelMap[key] || { zh: title, en: "" };

    const isManualEmpty = !autoJudgementEnabled && (
      key === 'emboss' ? (!manualInputs.embossWidth || !manualInputs.embossHeight) :
      key === 'engrave' ? (!manualInputs.engraveWidth || !manualInputs.engraveDepth) :
      (key !== 'watertight' && !manualInputs[key])
    );

    const isRowActive = autoJudgementEnabled ? isActive : !isManualEmpty;

    return (
      <div 
        onClick={() => {
          if (autoJudgementEnabled || key === 'watertight') {
            onToggleRule(key);
          }
        }}
        className={`p-4 rounded-xl flex flex-col border select-none transition-all gap-4 ${
          autoJudgementEnabled || key === 'watertight' ? 'cursor-pointer' : 'cursor-default'
        } ${
          isRowActive 
            ? 'bg-gray-900/40 border-gray-800/80 hover:bg-gray-900/70 hover:border-gray-700/80 shadow-md shadow-black/15' 
            : 'bg-gray-950/20 border-transparent opacity-35 hover:opacity-60'
        }`}
      >
        {/* 1. Header Row - Top Section Title spanning all the way left to right to PASS/FAIL */}
        <div className="flex items-center justify-between w-full pb-2.5 border-b border-gray-800/60">
          <div className="flex items-start gap-2.5 min-w-0">
            {/* Custom Checkbox */}
            <div className={`w-4.5 h-4.5 rounded-md flex items-center justify-center border transition-all shrink-0 mt-0.5 ${
              isRowActive 
                ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/15' 
                : 'border-gray-750 bg-gray-900/50'
            }`}>
              {isRowActive && <Check size={11} strokeWidth={4} />}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black text-gray-100 tracking-tight block truncate">
                {labels.zh}
              </span>
              {labels.en && (
                <span className="text-[10px] font-bold text-gray-500 tracking-wide mt-0.5">
                  {labels.en}
                </span>
              )}
            </div>
          </div>
          
          <div className="shrink-0">
            {isRowActive ? badgeElement : (
              <span className="flex items-center gap-0.5 text-[10px] bg-gray-800/50 border border-gray-700/30 text-gray-400 px-1.5 py-0.5 rounded font-bold">
                <EyeOff size={10} /> 排除 (OMIT)
              </span>
            )}
          </div>
        </div>

        {/* 2. Main Content Body Area */}
        <div className="flex items-start justify-between gap-4 w-full">
          {/* Left Side: Larger Schematic Icon + Specification requirement below the icon */}
          <div className="flex flex-col gap-2.5 shrink-0">
            <div className="w-[155px] h-[88px] rounded-lg bg-black/50 border border-gray-800/80 flex items-center justify-center overflow-hidden p-1.5 shrink-0 relative shadow-inner">
              {getSchematicSVG(key, isRowActive)}
            </div>
            
            {/* Specification requirements modified to stay below the schematic icon, styled to be prominent, white and 12.5px */}
            <div className="flex items-center gap-1.5 text-[12.5px] text-white font-extrabold px-0.5 leading-tight">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"></span>
              <span>{reqText}</span>
            </div>
          </div>

          {/* Right Side: Larger, bold detected actual data metrics / Manual fields */}
          <div className="flex flex-col justify-between items-end text-end self-stretch py-0.5 min-w-[125px]">
            {autoJudgementEnabled || key === 'watertight' ? (
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-[9px] uppercase font-black text-gray-500 tracking-wider">檢測數據</span>
                <span className="font-mono text-[21px] font-black text-white bg-slate-900/75 border border-slate-800/80 px-3 py-1.5 rounded-lg shadow-sm leading-none tracking-tight">
                  {actualText}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-1.5 w-full">
                <span className="text-[9px] uppercase font-black text-gray-400 tracking-wider mb-0.5">量測手動輸入</span>
                {key === 'emboss' ? (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="寬 (mm)"
                      value={manualInputs.embossWidth || ""}
                      onChange={(e) => onManualInputChange('embossWidth', e.target.value)}
                      className="font-mono text-xs font-semibold text-center text-white bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none w-20 px-1 py-1.5 rounded-lg shadow-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="高 (mm)"
                      value={manualInputs.embossHeight || ""}
                      onChange={(e) => onManualInputChange('embossHeight', e.target.value)}
                      className="font-mono text-xs font-semibold text-center text-white bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none w-20 px-1 py-1.5 rounded-lg shadow-sm"
                    />
                  </div>
                ) : key === 'engrave' ? (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="寬 (mm)"
                      value={manualInputs.engraveWidth || ""}
                      onChange={(e) => onManualInputChange('engraveWidth', e.target.value)}
                      className="font-mono text-xs font-semibold text-center text-white bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none w-20 px-1 py-1.5 rounded-lg shadow-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="深 (mm)"
                      value={manualInputs.engraveDepth || ""}
                      onChange={(e) => onManualInputChange('engraveDepth', e.target.value)}
                      className="font-mono text-xs font-semibold text-center text-white bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none w-20 px-1 py-1.5 rounded-lg shadow-sm"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="未輸入"
                      value={manualInputs[key] || ""}
                      onChange={(e) => onManualInputChange(key as string, e.target.value)}
                      className="font-mono text-xs font-semibold text-center text-white bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none w-24 px-1 py-1.5 rounded-lg shadow-sm"
                    />
                    <span className="text-[10px] text-gray-400 font-bold shrink-0">{key === 'overhangAngle' ? '°' : 'mm'}</span>
                  </div>
                )}
              </div>
            )}
            
            <span className="text-[9px] font-mono font-bold uppercase text-gray-600/80 tracking-widest mt-1">
              {autoJudgementEnabled ? "AUTO ANALYZER" : "MANUAL VERIFY"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 tracking-wide select-none">
          <span 
            onMouseDown={startPress}
            onMouseUp={cancelPress}
            onMouseLeave={cancelPress}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
            className={`cursor-pointer transition-all p-1.5 rounded-lg flex items-center justify-center relative ${
              isPressing ? 'bg-blue-500/20 scale-95' : 'hover:bg-gray-800'
            }`}
            title="長按5秒切換自動/手動檢測模式"
          >
            {isPressing && (
              <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle
                  cx="15"
                  cy="15"
                  r="12"
                  className="stroke-blue-500/20"
                  strokeWidth="2"
                  fill="transparent"
                />
                <circle
                  cx="15"
                  cy="15"
                  r="12"
                  className="stroke-blue-500 transition-all duration-100"
                  strokeWidth="2"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 12}`}
                  strokeDashoffset={`${2 * Math.PI * 12 * (1 - pressProgress / 100)}`}
                />
              </svg>
            )}
            <FileText 
              size={18} 
              className={`transition-colors duration-200 ${
                autoJudgementEnabled ? "text-green-400 animate-pulse" : "text-blue-400"
              }`} 
            />
          </span>
          幾何列印風險分析 {autoJudgementEnabled && <span className="text-[10px] bg-green-500/20 text-green-300 border border-green-500/30 px-1.5 py-0.5 rounded font-bold tracking-widest animate-pulse ml-1">自動判定模式</span>}
        </h3>
        <button 
          onClick={onExportPDF}
          className="text-[10px] font-bold text-blue-300 flex items-center gap-1.5 hover:text-white cursor-pointer bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1.5 rounded transition-colors"
        >
          儲存 PDF 報告 <Download size={12} />
        </button>
      </div>
      
      {/* Target Spec Guidelines Header */}
      <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/60 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
            檢測技術標準
          </span>
        </div>
        <h4 className="text-xs font-black text-white">Formlabs Form 4 統一設計指南</h4>
        <p className="text-[10px] text-gray-400 leading-normal">
          {specs.description}
        </p>
      </div>

      {/* Main Risk Card */}
      <div className={`p-5 rounded-xl border ${styles.border} ${styles.bg} space-y-4 shadow-lg`}>
        <div className="flex items-center gap-4">
          <div className={`${styles.color} p-2 bg-black/20 rounded-full`}>
            <styles.Icon size={28} />
          </div>
          <div>
            <p className="text-[10px] text-gray-200 uppercase font-bold tracking-widest mb-0.5">整體風險評級</p>
            <h4 className={`text-lg font-black tracking-tight ${styles.color}`}>
              {report.riskLevel === RiskLevel.LOW ? '低風險 - 可直接列印' : 
               report.riskLevel === RiskLevel.MEDIUM ? '中等風險 - 建議優化' : '高風險 - 需調整設計'}
            </h4>
          </div>
        </div>

        <div className="bg-black/20 p-3 rounded-lg border border-white/5">
            <p className="text-xs text-white leading-relaxed italic font-medium">
            "{report.explanation}"
            </p>
        </div>

        {/* Checked Metrics Table - Form 4 Design Guidelines */}
        <div className="space-y-2 pt-2 border-t border-gray-700/30">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 block">特徵尺寸細部分析與啟用</span>
            <span className="text-[9px] font-bold text-blue-400">(點擊可排除特定檢測項目)</span>
          </div>
          
          <div className="space-y-2">
            {/* 1. Supported Wall */}
            {renderCheckRow(
              'supportedWall',
              '受支撐壁厚 (Supported Wall)',
              `規範要求 ≥ ${specs.minSupportedWall} mm`,
              `${report.minSupportedWallActual.toFixed(2)} mm`,
              getStatusBadge(report.minSupportedWallActual, specs.minSupportedWall)
            )}

            {/* 2. Unsupported Wall */}
            {renderCheckRow(
              'unsupportedWall',
              '無支撐壁厚 (Unsupported Wall)',
              `規範要求 ≥ ${specs.minUnsupportedWall} mm`,
              `${report.minUnsupportedWallActual.toFixed(2)} mm`,
              getStatusBadge(report.minUnsupportedWallActual, specs.minUnsupportedWall)
            )}

            {/* 3. Min Hole */}
            {renderCheckRow(
              'hole',
              '最小微小孔位直徑 (Min Hole)',
              `規範要求 ≥ ${specs.minHole} mm`,
              `${report.minHoleActual.toFixed(2)} mm`,
              getStatusBadge(report.minHoleActual, specs.minHole)
            )}

            {/* 4. Clearance */}
            {renderCheckRow(
              'clearance',
              '裝配部件間隙 (Clearance)',
              `規範要求 ≥ ${specs.minClearance} mm`,
              `${report.minClearanceActual.toFixed(2)} mm`,
              getStatusBadge(report.minClearanceActual, specs.minClearance)
            )}

            {/* 5. Unsupported Overhang */}
            {renderCheckRow(
              'overhang',
              '無支撐懸空防垮跨距 (Overhang)',
              `規範要求 ≤ ${specs.maxUnsupportedOverhang} mm`,
              `${report.maxUnsupportedOverhangActual.toFixed(2)} mm`,
              getStatusBadge(report.maxUnsupportedOverhangActual, specs.maxUnsupportedOverhang, false)
            )}

            {/* 5b. Unsupported Overhang Angle */}
            {renderCheckRow(
              'overhangAngle',
              '最小無支撐懸空角度 (Overhang Angle)',
              `設計指南要求 ≥ ${specs.minOverhangAngle} °`,
              `${report.minOverhangAngleActual.toFixed(1)} ° (from level)`,
              getStatusBadge(report.minOverhangAngleActual, specs.minOverhangAngle, true)
            )}

            {/* 5c. Maximum Horizontal Support Span / Bridge */}
            {renderCheckRow(
              'bridgeSpan',
              '最大水平支撐跨度/橋接 (Span/Bridge)',
              `設計指南要求 ≤ ${specs.maxBridgeSpan} mm`,
              `${report.maxBridgeSpanActual.toFixed(1)} mm`,
              getStatusBadge(report.maxBridgeSpanActual, specs.maxBridgeSpan, false)
            )}

            {/* 5d. Minimum Vertical Wire Diameter (H <= 7mm) */}
            {renderCheckRow(
              'verticalWire7',
              '最小垂直銷釘直徑 (高度 ≤ 7mm)',
              `設計指南要求 ≥ ${specs.minVerticalWire7} mm`,
              `${report.minVerticalWire7Actual.toFixed(2)} mm`,
              getStatusBadge(report.minVerticalWire7Actual, specs.minVerticalWire7, true)
            )}

            {/* 5e. Minimum Vertical Wire Diameter (H <= 30mm) */}
            {renderCheckRow(
              'verticalWire30',
              '最小垂直銷釘直徑 (高度 ≤ 30mm)',
              `設計指南要求 ≥ ${specs.minVerticalWire30} mm`,
              `${report.minVerticalWire30Actual.toFixed(2)} mm`,
              getStatusBadge(report.minVerticalWire30Actual, specs.minVerticalWire30, true)
            )}

             {/* 6. Embossed Detail */}
             {renderCheckRow(
               'emboss',
               '陽刻突出特色尺寸 (Embossed Detail)',
               `設計指南要求寬/高 ≥ ${specs.minEmbossedWidth} mm`,
               `寬: ${report.minEmbossedWidthActual.toFixed(2)} / 高: ${report.minEmbossedHeightActual.toFixed(2)} mm`,
               getStatusBadge(Math.min(report.minEmbossedWidthActual, report.minEmbossedHeightActual), specs.minEmbossedWidth, true)
             )}

            {/* 7. Engraved Detail */}
            {renderCheckRow(
              'engrave',
              '陰刻凹槽特色尺寸 (Engraved Detail)',
              `設計指南要求寬/深 ≥ ${specs.minEngravedWidth} mm`,
              `寬: ${report.minEngravedWidthActual.toFixed(2)} / 深: ${report.minEngravedDepthActual.toFixed(2)} mm`,
              getStatusBadge(Math.min(report.minEngravedWidthActual, report.minEngravedDepthActual), specs.minEngravedWidth, true)
            )}

            {/* 8. Escape/Drain Hole */}
            {renderCheckRow(
              'escapeHole',
              '最小中空排水孔徑 (Drain Hole)',
              `設計指南要求直徑 ≥ ${specs.minEscapeHole} mm`,
              report.minEscapeHoleActual > 0 ? `${report.minEscapeHoleActual.toFixed(2)} mm` : '無中空腔體 (不適用)',
              report.minEscapeHoleActual > 0 
                ? getStatusBadge(report.minEscapeHoleActual, specs.minEscapeHole)
                : <span className="text-[10px] bg-green-500/15 border border-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-black max-h-[19px]">無需檢測</span>
            )}
            
            {/* 9. Watertightness Check */}
            {renderCheckRow(
              'watertight',
              '幾何水密密封性 (Watertight)',
              '網格是否無孔破損安全',
              report.geometryStats.isWatertight ? '正常 (Closed)' : '有破孔 (Open)',
              report.geometryStats.isWatertight ? (
                <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded font-black">
                  正常 (PASS)
                </span>
              ) : (
                <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-black animate-pulse">
                  破損 (FAIL)
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AnalysisPanel;
