import React, { useState, useEffect } from 'react';
import { SavedProject, fetchUserProjects, deleteProject } from '../services/firebase';
import { X, Clock, Trash2, FolderOpen, RotateCw, Layers, CheckCircle2, RefreshCw } from 'lucide-react';

interface ProjectsHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onApplyProjectRotation?: (rotation: { x: number; y: number; z: number }) => void;
}

export const ProjectsHistoryModal: React.FC<ProjectsHistoryModalProps> = ({
  isOpen,
  onClose,
  userId,
  onApplyProjectRotation
}) => {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadProjects = async () => {
    if (!userId) return;
    setLoading(true);
    const data = await fetchUserProjects(userId);
    setProjects(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleDelete = async (projectId: string, fileName: string) => {
    if (!window.confirm(`確定要刪除「${fileName}」的雲端分析紀錄嗎？`)) {
      return;
    }
    try {
      setDeletingId(projectId);
      await deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      alert('刪除紀錄失敗');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div 
        className="w-full max-w-2xl bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-blue-900/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                雲端分析與優化歷史紀錄
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                檢視您保存在帳號中的 3D 列印幾何分析與推薦擺放角度紀錄
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadProjects}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              title="重新整理"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              title="關閉"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
              <RefreshCw size={24} className="animate-spin text-blue-400" />
              <p className="text-xs">載入雲端紀錄中...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 text-gray-500 text-sm flex flex-col items-center gap-2">
              <FolderOpen size={36} className="text-gray-600" />
              <p>目前尚無保存的分析專案</p>
              <p className="text-xs text-gray-600">完成幾何分析或姿態優化後，可點選「儲存至雲端紀錄」保存結果</p>
            </div>
          ) : (
            projects.map((project) => (
              <div 
                key={project.id}
                className="bg-gray-800/60 border border-gray-700/60 hover:border-gray-600 rounded-xl p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">{project.fileName}</span>
                    {project.score !== undefined && (
                      <span className="text-[10px] bg-green-500/20 text-green-300 border border-green-500/30 px-1.5 py-0.5 rounded font-mono">
                        適配度 {(project.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span>
                      儲存時間: {new Date(project.createdAt).toLocaleString()}
                    </span>
                    {project.rotation && (
                      <span className="font-mono text-blue-300">
                        旋轉: X: {project.rotation.x}° / Y: {project.rotation.y}° / Z: {project.rotation.z}°
                      </span>
                    )}
                  </div>

                  {project.notes && (
                    <p className="text-xs text-gray-400 bg-gray-900/60 p-2 rounded-lg border border-gray-800">
                      備註: {project.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-700/40">
                  {project.rotation && onApplyProjectRotation && (
                    <button
                      onClick={() => {
                        onApplyProjectRotation(project.rotation!);
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="將此擺放角度套用至 3D 視圖"
                    >
                      <RotateCw size={13} />
                      <span>套用角度</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(project.id, project.fileName)}
                    disabled={deletingId === project.id}
                    className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-700/60 transition-colors"
                    title="刪除此紀錄"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-gray-950/60 border-t border-gray-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
