export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH'
}

export enum MarkingType {
  NONE = 0,
  MINIMIZE_SUPPORT = 1,
  CRITICAL_HOLE = 2,
  ERASER = 3
}

export interface GeometryStats {
  vertexCount: number;
  faceCount: number;
  boundingBox: {
    min: { x: number, y: number, z: number };
    max: { x: number, y: number, z: number };
    size: { x: number, y: number, z: number };
  };
  volume: number;
  isWatertight: boolean; // Computed or simulated for build review
  fileName?: string;
}

export interface Form4Specs {
  minSupportedWall: number;       // mm
  minUnsupportedWall: number;     // mm
  minHole: number;                // mm
  minClearance: number;           // mm
  maxUnsupportedOverhang: number; // mm
  minOverhangAngle: number;       // degrees
  maxBridgeSpan: number;          // mm
  minVerticalWire7: number;       // mm (for 7mm tall wires, guide: 0.3mm)
  minVerticalWire30: number;      // mm (for 30mm tall wires, guide: 0.6mm)
  minEscapeHole: number;          // mm
  minEmbossedWidth: number;       // mm
  minEmbossedHeight: number;      // mm
  minEngravedWidth: number;       // mm
  minEngravedDepth: number;       // mm
  description: string;
}

export const FORM4_STANDARD_SPECS: Form4Specs = {
  minSupportedWall: 0.20,
  minUnsupportedWall: 0.40,
  minHole: 0.50,
  minClearance: 0.40,
  maxUnsupportedOverhang: 5.0,
  minOverhangAngle: 10.0,
  maxBridgeSpan: 29.0,
  minVerticalWire7: 0.30,
  minVerticalWire30: 0.60,
  minEscapeHole: 0.75,
  minEmbossedWidth: 0.10,
  minEmbossedHeight: 0.10,
  minEngravedWidth: 0.15,
  minEngravedDepth: 0.15,
  description: '根據 Formlabs Form 4 設計指南，本檢測標準適用於 Form 4 設備列印之各類常規及工程用途樹脂。'
};

export interface ActiveRules {
  supportedWall: boolean;
  unsupportedWall: boolean;
  hole: boolean;
  clearance: boolean;
  overhang: boolean;
  overhangAngle: boolean;
  bridgeSpan: boolean;
  verticalWire7: boolean;
  verticalWire30: boolean;
  emboss: boolean;
  engrave: boolean;
  escapeHole: boolean;
  watertight: boolean;
}

export interface AnalysisReport {
  riskLevel: RiskLevel;
  explanation: string;
  suggestedAction: string;
  specs: Form4Specs;
  activeRules: ActiveRules;
  
  // Detailed Metrics (Actual detected values)
  geometryStats: GeometryStats;
  minSupportedWallActual: number;
  minUnsupportedWallActual: number;
  minHoleActual: number;
  minClearanceActual: number;
  maxUnsupportedOverhangActual: number;
  minOverhangAngleActual: number;
  maxBridgeSpanActual: number;
  minVerticalWire7Actual: number;
  minVerticalWire30Actual: number;
  minEscapeHoleActual: number;
  minEmbossedWidthActual: number;
  minEmbossedHeightActual: number;
  minEngravedWidthActual: number;
  minEngravedDepthActual: number;
  
  // Overall risks & dimensional aggregates
  minThickness: number; // overall min wall mm
  minDimension: number; // mm (smallest bbox axis)
  holeDeformationRatio: number; // 0.0 to 1.0
  overhangRatio: number;
  suctionCupRisk: number;
}

export interface OptimizationWeights {
  printability: number; // a
  userMarking: number; // b
  areaVariance: number; // c
  holeAccuracy: number; // d
}
