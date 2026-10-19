
import React from 'react';
import { Settings, SlidersHorizontal, Target, Layers, ArrowUpDown } from 'lucide-react';
import { OptimizationWeights } from '../types';

interface ControlPanelProps {
  weights: OptimizationWeights;
  setWeights: (w: OptimizationWeights) => void;
  flipOrientation?: boolean;
  setFlipOrientation?: (flip: boolean) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ weights, setWeights, flipOrientation = false, setFlipOrientation }) => {
  
  const handleCDChange = (val: number) => {
    setWeights({
      ...weights,
      areaVariance: 1 - val,
      holeAccuracy: val
    });
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2 tracking-wide">
        <Settings size={18} className="text-blue-400"/> 優化參數配置
      </h3>
      
      <div className="bg-gray-800/40 p-5 rounded-xl border border-gray-700 space-y-6 shadow-inner">
        <div className="space-y-2.5">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-gray-200">可列印優先度 (a)</span>
            <span className="text-blue-400 font-mono font-bold">{(weights.printability * 100).toFixed(0)}%</span>
          </div>
          <input 
            type="range" min="0" max="1" step="0.1" 
            value={weights.printability}
            onChange={(e) => setWeights({ ...weights, printability: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
          />
        </div>

        <div className="space-y-2.5">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-gray-200">藍色標記區域優先度 (b)</span>
            <span className="text-blue-400 font-mono font-bold">{(weights.userMarking * 100).toFixed(0)}%</span>
          </div>
          <input 
            type="range" min="0" max="1" step="0.1" 
            value={weights.userMarking}
            onChange={(e) => setWeights({ ...weights, userMarking: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
          />
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-700/50">
          <div className="flex items-center justify-between text-xs text-gray-300 font-medium mb-1">
            <span className="flex items-center gap-1.5"><Layers size={12} className="text-blue-300"/> 整體精度 (c)</span>
            
            {setFlipOrientation && (
              <button 
                onClick={() => setFlipOrientation(!flipOrientation)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold transition-all border shadow-sm ${
                  flipOrientation 
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-indigo-500/20' 
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
                title="反轉基礎軸向 (Flip 180°)"
              >
                <ArrowUpDown size={10} />
                <span>{flipOrientation ? '反向' : '正向'}</span>
              </button>
            )}

            <span className="flex items-center gap-1.5">孔洞精度 (d) <Target size={12} className="text-amber-300"/></span>
          </div>
          
          <div className="relative pt-1">
             <input 
              type="range" min="0" max="1" step="0.05" 
              value={weights.holeAccuracy}
              onChange={(e) => handleCDChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-gradient-to-r from-blue-900/50 to-amber-900/50 rounded-lg appearance-none cursor-pointer accent-white"
            />
            <div className="flex justify-between mt-2.5 font-mono text-[10px] font-bold">
              <span className={weights.areaVariance > 0.5 ? "text-blue-400" : "text-gray-500"}>
                c: {(weights.areaVariance * 100).toFixed(0)}%
              </span>
              <span className={weights.holeAccuracy > 0.5 ? "text-amber-400" : "text-gray-500"}>
                d: {(weights.holeAccuracy * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          
          <p className="text-[10px] text-gray-400 leading-relaxed bg-black/20 p-3 rounded-lg border border-gray-700/30">
            註: 調整 (c)/(d) 比例以決定基底姿態。若標記面朝下，可嘗試點擊「反向」按鈕翻轉模型。
          </p>
        </div>
      </div>
    </section>
  );
};

export default ControlPanel;
