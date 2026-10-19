
/**
 * BACKEND ARCHITECTURE & ALGORITHM SPECIFICATION (SLA Optimization)
 * 
 * 1. 技術棧建議:
 *    - FastAPI: 用於高性能異步 API
 *    - Trimesh: STL 幾何處理的核心庫
 *    - Numpy/Scipy: 矩陣運算與優化
 *    - Celery/Redis: 處理大型 STL (10M+ 面數) 的異步工作排程
 * 
 * 2. 數據傳輸 (Data Contracts):
 *    - 上傳: Multipart/form-data STL
 *    - 標記: 使用 `vertex_indices` 或是 `face_indices` 的壓縮數組 (e.g., Run-length encoding)
 *    - 優化結果: 返回旋轉矩陣 (4x4 Matrix) 與優化後的幾何統計
 * 
 * 3. 優化評分策略 (Sequential Check & Repair Strategy):
 *    
 *    我們採用檢測與修正邏輯，而非全域加權，以確保在滿足必要條件的前提下保留最大幾何特徵。
 *    
 *    Step 0: 基底策略 (Base Strategy - C & D)
 *    - 根據 c (截面積) 與 d (孔位) 的權重計算初始姿態 Q_base。
 *    - 若 d 高，優先考慮孔位垂直；若 c 高，優先考慮最小截面變化。
 * 
 *    Step 1: 標記檢測 (Marking Check - B)
 *    - 計算標記區域在 Q_base 下的法線 N_mark。
 *    - 條件判斷: 若 N_mark.z < Threshold (例如 -0.2, 表示面朝下需支撐)，則視為風險。
 *    - 修正: 計算將 N_mark 轉至 +Z 的旋轉 Q_fix。
 *    - 應用: Q_current = Slerp(Q_base, Q_fix * Q_base, weight_b)。
 *    - 若 N_mark.z >= Threshold (面朝側或上)，則判定為 Pass，不進行修正。
 * 
 *    Step 2: 可列印性檢測 (Printability Check - A)
 *    - 檢查目前的 Q_current 是否處於極端不穩定狀態 (如極大包圍盒或重心偏移)。
 *    - 若檢測觸發，則將姿態向最近的主軸 (Principal Axis) 拉回，拉回程度由 weight_a 決定。
 * 
 * 4. 效能優化 (Large STL Handling):
 *    - 伺服器端應在接收時先進行 Decimation (簡化)。例如將 10M 簡化至 100K 進行初步優化搜索。
 *    - 使用 Numpy 的向量化操作計算點積與投影，避免 Python 迴圈。
 */

export const BACKEND_STUB = "Refer to the Python architecture description for actual implementation.";
