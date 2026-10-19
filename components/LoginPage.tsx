import React, { useState } from 'react';
import { 
  loginWithCustomEmail, 
  registerWithCustomEmail, 
  loginWithGoogle, 
  completeGoogleRegistrationWithCode, 
  renewAccountWithInviteCode,
  clearLocalSession,
  UserProfile,
  PendingGoogleUser
} from '../services/firebase';
import { 
  Box, 
  Lock, 
  Mail, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  ShieldCheck, 
  Loader2, 
  Sparkles, 
  KeyRound, 
  Calendar, 
  RefreshCw, 
  Monitor, 
  Layers, 
  ArrowRight,
  HelpCircle,
  Laptop,
  Check,
  Compass
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (profile: UserProfile) => void;
  sessionConflictNotice?: string | null;
  onClearConflictNotice?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  sessionConflictNotice,
  onClearConflictNotice
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'renew' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [renewInviteCode, setRenewInviteCode] = useState('');
  const [renewalEmail, setRenewalEmail] = useState('');
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Single active session conflict state
  const [sessionConflict, setSessionConflict] = useState<{
    deviceLabel: string;
    occupiedTime?: string;
    message?: string;
  } | null>(null);

  // Google first-time invite code binding state
  const [pendingGoogleUser, setPendingGoogleUser] = useState<PendingGoogleUser | null>(null);
  const [googleInviteCode, setGoogleInviteCode] = useState('');

  const resetMessages = () => {
    setError(null);
    setSuccessMsg(null);
    setSessionConflict(null);
    onClearConflictNotice?.();
  };

  const handleModeSwitch = (newMode: 'login' | 'register' | 'renew' | 'forgot') => {
    resetMessages();
    setMode(newMode);
    if (newMode === 'renew' && email && !renewalEmail) {
      setRenewalEmail(email);
    }
  };

  // Email/Password login or registration
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!email.trim()) {
      setError('請輸入電子郵件信箱。');
      return;
    }

    if (mode === 'forgot') {
      setSuccessMsg('已記錄重設密碼請求。請聯繫系統管理員 (karta1685232@gmail.com) 索取臨時密碼或由後台重設。');
      return;
    }

    if (!password) {
      setError('請輸入密碼。');
      return;
    }

    if (mode === 'register') {
      if (!displayName.trim()) {
        setError('請輸入您的使用者名稱或工程師代號。');
        return;
      }
      if (!inviteCode.trim()) {
        setError('註冊需要系統管理員配發之「授權邀請序號」。');
        return;
      }
    }

    try {
      setLoading(true);
      if (mode === 'login') {
        const profile = await loginWithCustomEmail(email.trim(), password);
        onLoginSuccess(profile);
      } else {
        const profile = await registerWithCustomEmail(
          email.trim(),
          password,
          displayName.trim(),
          inviteCode.trim()
        );
        onLoginSuccess(profile);
      }
    } catch (err: any) {
      if (err?.code === 'ACCOUNT_ALREADY_LOGGED_IN') {
        setSessionConflict({
          deviceLabel: err.deviceLabel || '其他電腦',
          occupiedTime: err.occupiedTime,
          message: err.message
        });
        return;
      }
      if (err?.code === 'ACCOUNT_EXPIRED') {
        setRenewalEmail(err.expiredEmail || email.trim());
        setExpiredNotice(err.message || '該帳號使用期限已到期，請使用授權邀請碼續期。');
        setMode('renew');
        return;
      }
      setError(err?.message || '驗證失敗，請檢查輸入或稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth Sign In
  const handleGoogleSignIn = async () => {
    resetMessages();
    try {
      setLoading(true);
      const res = await loginWithGoogle(mode === 'register' ? inviteCode : undefined);
      if (res.status === 'authenticated' && res.profile) {
        if (res.profile.status === 'disabled') {
          setError('該帳號目前已被停用，請聯繫系統管理員。');
          return;
        }
        onLoginSuccess(res.profile);
      } else if (res.status === 'needs_invite' && res.pendingGoogleUser) {
        setPendingGoogleUser(res.pendingGoogleUser);
        setGoogleInviteCode('');
      } else if (res.status === 'expired_needs_renewal' && res.pendingGoogleUser) {
        setRenewalEmail(res.pendingGoogleUser.email);
        setExpiredNotice(`Google 帳號 (${res.pendingGoogleUser.email}) 授權期限已屆滿。請輸入管理員配發之「授權邀請序號」開通續期：`);
        setMode('renew');
      }
    } catch (err: any) {
      if (err?.code === 'ACCOUNT_ALREADY_LOGGED_IN') {
        setSessionConflict({
          deviceLabel: err.deviceLabel || '其他電腦',
          occupiedTime: err.occupiedTime,
          message: err.message
        });
        return;
      }
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'Google 登入失敗，請稍後再試。');
      }
    } finally {
      setLoading(false);
    }
  };

  // Google First-Time Registration with Invite Code
  const handleCompleteGoogleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleUser) return;
    resetMessages();

    if (!googleInviteCode.trim()) {
      setError('請輸入授權邀請序號。');
      return;
    }

    try {
      setLoading(true);
      const profile = await completeGoogleRegistrationWithCode(
        pendingGoogleUser.uid,
        pendingGoogleUser.email,
        pendingGoogleUser.displayName,
        googleInviteCode.trim()
      );
      onLoginSuccess(profile);
    } catch (err: any) {
      setError(err?.message || '開通失敗，請檢查邀請碼是否已被使用或向管理員索取。');
    } finally {
      setLoading(false);
    }
  };

  // Renew Expired Account
  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    const targetEmail = (renewalEmail || email).trim();
    if (!targetEmail) {
      setError('請輸入欲續期之帳號 Email。');
      return;
    }
    if (!renewInviteCode.trim()) {
      setError('請輸入新的一組一次性授權邀請序號。');
      return;
    }

    try {
      setLoading(true);
      const profile = await renewAccountWithInviteCode(targetEmail, renewInviteCode.trim(), password || undefined);
      const expDateStr = profile.expiresAt ? profile.expiresAt.slice(0, 10) : '';
      setSuccessMsg(`帳號續期成功！有效期限已延長 1 年${expDateStr ? `（至 ${expDateStr}）` : ''}，即將進入系統...`);
      setTimeout(() => {
        onLoginSuccess(profile);
      }, 700);
    } catch (err: any) {
      setError(err?.message || '續期驗證失敗，請確認序號或向管理員索取。');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelGooglePending = async () => {
    setPendingGoogleUser(null);
    setGoogleInviteCode('');
    resetMessages();
    await clearLocalSession();
  };

  return (
    <div className="min-h-screen w-full bg-[#07090e] text-gray-100 flex flex-col justify-between relative overflow-y-auto overflow-x-hidden font-sans select-none">
      {/* Ambient background glow accents */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Subtle blueprint grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Top Navigation Bar */}
      <header className="relative z-10 w-full px-6 py-4 border-b border-gray-800/80 bg-gray-900/60 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]">
            <Box size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-base sm:text-lg">SWTC 設備工程</span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-mono font-semibold">
                Formlabs Form 4 SLA
              </span>
            </div>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">
              3D Print Optimization & Geometric Risk Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-amber-400/90 bg-amber-950/40 border border-amber-800/50 px-3 py-1 rounded-full">
            <ShieldCheck size={14} className="text-amber-400" />
            <span>內部管制授權系統</span>
          </span>
          <span className="text-[11px] text-gray-500 font-mono hidden md:inline">
            v1.2.0 • Build 2026
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-4 sm:py-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Hero Column: Engineering value & feature summary */}
          <div className="lg:col-span-6 space-y-6 text-left hidden lg:block pr-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
              <Sparkles size={14} />
              <span>Formlabs Form 4 專用智能工程分析</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              SLA 3D 列印建構姿態<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300">
                與幾何風險智能最佳化
              </span>
            </h1>

            <p className="text-sm text-gray-400 leading-relaxed max-w-lg">
              專為精密工程零件打造。透過多面向上百維度採樣，自動計算 Formlabs Form 4 之剝離力學、支撐耗用、投影突變與裝配孔位精度，協助工程師秒級找出最佳列印姿態。
            </p>

            {/* Feature Checklist */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-start gap-3 text-xs text-gray-300">
                <div className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                  <Check size={14} />
                </div>
                <div>
                  <span className="font-semibold text-white">13 項 Formlabs SLA 幾何極限檢測：</span>
                  <p className="text-gray-400 text-[11px] mt-0.5">薄壁、孔徑、懸垂角、橋接跨距、細針自立與未支撐邊緣自動計算判定</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-gray-300">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                  <Layers size={14} />
                </div>
                <div>
                  <span className="font-semibold text-white">關鍵外觀表面與孔位保護標註：</span>
                  <p className="text-gray-400 text-[11px] mt-0.5">自訂 3D 筆刷塗抹關鍵面，強制引導支撐結構生成於非關鍵區域</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-gray-300">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Laptop size={14} />
                </div>
                <div>
                  <span className="font-semibold text-white">單一電腦在線安全鎖定機制：</span>
                  <p className="text-gray-400 text-[11px] mt-0.5">防共用保護，帳號登入時鎖定單機，前台正常登出或閒置後自動釋放</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-800/80 flex items-center gap-6 text-xs text-gray-500">
              <div className="flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Cloud Firestore Sync</span>
              </div>
              <div className="font-mono">OAuth 2.0 / Firebase Auth</div>
            </div>
          </div>

          {/* Right Auth Card: Login / Register / Renew Form */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto">
            <div className="bg-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
              
              {/* Card Header Banner */}
              <div className="bg-gradient-to-r from-blue-600/20 via-indigo-600/15 to-transparent p-6 pb-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${
                    pendingGoogleUser || mode === 'renew' ? 'bg-amber-600 shadow-amber-500/20' : 'bg-blue-600 shadow-blue-500/30'
                  }`}>
                    {pendingGoogleUser ? (
                      <KeyRound size={22} />
                    ) : mode === 'renew' ? (
                      <RefreshCw size={22} />
                    ) : (
                      <ShieldCheck size={22} />
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      {pendingGoogleUser && 'Google 帳號初次開通'}
                      {!pendingGoogleUser && mode === 'login' && '登入系統帳號'}
                      {!pendingGoogleUser && mode === 'register' && '開通註冊帳號'}
                      {!pendingGoogleUser && mode === 'renew' && '帳號序號續期'}
                      {!pendingGoogleUser && mode === 'forgot' && '重設登入密碼'}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {pendingGoogleUser
                        ? '請輸入一次性邀請碼以建立工程師權限'
                        : mode === 'renew'
                        ? '輸入新授權序號即可重新延長 1 年使用期限'
                        : '請先驗證您的工程師身分以進入操作介面'}
                    </p>
                  </div>
                </div>

                {/* Tabs for Login / Register / Renew */}
                {!pendingGoogleUser && (
                  <div className="flex border-b border-gray-800 mt-5 -mx-6 px-6 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('login')}
                      className={`pb-2.5 px-3 font-medium border-b-2 transition-all cursor-pointer ${
                        mode === 'login'
                          ? 'border-blue-500 text-blue-400 font-semibold'
                          : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      登入帳號
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('register')}
                      className={`pb-2.5 px-3 font-medium border-b-2 transition-all cursor-pointer ${
                        mode === 'register'
                          ? 'border-blue-500 text-blue-400 font-semibold'
                          : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      快速註冊
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('renew')}
                      className={`pb-2.5 px-3 font-medium border-b-2 transition-all cursor-pointer ${
                        mode === 'renew'
                          ? 'border-amber-500 text-amber-400 font-semibold'
                          : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      序號續期
                    </button>
                  </div>
                )}
              </div>

              {/* Card Form Body */}
              <div className="p-6 space-y-4">
                
                {/* Global Session Conflict Warning Banner */}
                {(sessionConflict || sessionConflictNotice) && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2.5 text-xs animate-fade-in">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                      <Monitor size={18} className="text-amber-400 shrink-0" />
                      <span>此帳號目前已在另一台電腦登入中</span>
                    </div>
                    {sessionConflict && (
                      <p className="text-gray-300 leading-relaxed text-xs">
                        目前在線電腦：<span className="font-semibold text-amber-200 font-mono">{sessionConflict.deviceLabel}</span>
                        {sessionConflict.occupiedTime ? `（最近活躍：${sessionConflict.occupiedTime}）` : ''}
                      </p>
                    )}
                    {sessionConflictNotice && !sessionConflict && (
                      <p className="text-gray-300 leading-relaxed text-xs">
                        {sessionConflictNotice}
                      </p>
                    )}
                    <div className="p-3 bg-gray-950/70 border border-gray-800 rounded-lg text-[11px] text-gray-400 space-y-1.5">
                      <p className="font-semibold text-gray-300 flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-blue-400" />
                        單一電腦在線保護規則：
                      </p>
                      <p>• 為防護帳號安全，系統規定一個帳號一次僅限登入一台電腦。</p>
                      <p>• 請先至原登入電腦點擊右上角【登出】，本台電腦即可直接登入。</p>
                      <p>• 若先前電腦已關機，系統閒置 2.5 分鐘後將自動解鎖，亦可請管理員於後台點擊【解除鎖定】。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSessionConflict(null);
                        onClearConflictNotice?.();
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300 underline cursor-pointer inline-block mt-1"
                    >
                      關閉提示並重試
                    </button>
                  </div>
                )}

                {/* Error Banner */}
                {error && !sessionConflict && (
                  <div className="p-3.5 bg-red-950/50 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-center gap-2 animate-fade-in">
                    <AlertCircle size={16} className="text-red-400 shrink-0" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

                {/* Success Banner */}
                {successMsg && (
                  <div className="p-3.5 bg-green-950/50 border border-green-800/80 rounded-xl text-green-200 text-xs flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* CONDITION 1: Pending Google First-Time Invite Code */}
                {pendingGoogleUser ? (
                  <div className="space-y-4 animate-fade-in">
                    <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl text-xs space-y-1 text-gray-300">
                      <p className="text-blue-300 font-semibold">Google 帳號驗證通過：</p>
                      <p className="font-mono text-white">{pendingGoogleUser.email}</p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        初次登入請輸入一組未使用的授權邀請序號以綁定帳號並開通 1 年使用權限。
                      </p>
                    </div>

                    <form onSubmit={handleCompleteGoogleAuth} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                          授權邀請序號 (Invite Code)
                        </label>
                        <div className="relative">
                          <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                          <input
                            type="text"
                            required
                            value={googleInviteCode}
                            onChange={(e) => setGoogleInviteCode(e.target.value.toUpperCase())}
                            placeholder="SWTC-XXXX-XXXX-XXXX"
                            className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-mono tracking-wider uppercase focus:outline-none focus:border-blue-500 transition-colors"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        <span>驗證序號並進入系統</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCancelGooglePending}
                        className="w-full text-xs text-gray-400 hover:text-gray-200 py-1"
                      >
                        取消並切換其他帳號
                      </button>
                    </form>
                  </div>
                ) : mode === 'renew' ? (
                  /* CONDITION 2: Account Renewal */
                  <div className="space-y-4 animate-fade-in">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1">
                      <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                        <Calendar size={14} />
                        <span>帳號使用期限已到期 / 序號續期</span>
                      </div>
                      <p className="text-[11px] text-gray-300 leading-relaxed">
                        {expiredNotice || '輸入由管理員配發之「授權邀請序號」，即可為該帳號延長 1 年使用期限（未過期將由原到期日順延 1 年，已過期則自當日起展延 1 年）。'}
                      </p>
                    </div>

                    <form onSubmit={handleRenewSubmit} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                          欲續期之帳號 Email
                        </label>
                        <div className="relative">
                          <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                          <input
                            type="email"
                            required
                            value={renewalEmail}
                            onChange={(e) => setRenewalEmail(e.target.value)}
                            placeholder="engineer@company.com"
                            className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                          新授權邀請序號 (Invite Code)
                        </label>
                        <div className="relative">
                          <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                          <input
                            type="text"
                            required
                            value={renewInviteCode}
                            onChange={(e) => setRenewInviteCode(e.target.value.toUpperCase())}
                            placeholder="SWTC-XXXX-XXXX-XXXX"
                            className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-mono tracking-wider uppercase focus:outline-none focus:border-amber-500 transition-colors"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl text-sm shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        <span>立即延長 1 年並登入</span>
                      </button>

                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => handleModeSwitch('login')}
                          className="text-xs text-gray-400 hover:text-white"
                        >
                          返回一般登入
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  /* CONDITION 3: Standard Login / Register / Forgot Password */
                  <div className="space-y-3.5">
                    
                    <form onSubmit={handleEmailAuth} className="space-y-3">
                      {/* Name field (Register only) */}
                      {mode === 'register' && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-300 mb-1">
                            工程師姓名 / 使用者名稱
                          </label>
                          <div className="relative">
                            <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                              type="text"
                              required
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              placeholder="例：王大明 / CAD-01"
                              className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                        </div>
                      )}

                      {/* Email Field */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1">
                          電子郵件 (Email)
                        </label>
                        <div className="relative">
                          <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="engineer@company.com"
                            className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                          />
                        </div>
                      </div>

                      {/* Password Field */}
                      {mode !== 'forgot' && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-semibold text-gray-300">
                              登入密碼
                            </label>
                            {mode === 'login' && (
                              <button
                                type="button"
                                onClick={() => handleModeSwitch('forgot')}
                                className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                              >
                                忘記密碼？
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                              type="password"
                              required
                              minLength={6}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                        </div>
                      )}

                      {/* Invite Code (Register only) */}
                      {mode === 'register' && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-semibold text-gray-300">
                              授權邀請序號 (必填)
                            </label>
                            <span className="text-[10px] text-gray-500">向管理員索取</span>
                          </div>
                          <div className="relative">
                            <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                              type="text"
                              required
                              value={inviteCode}
                              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                              placeholder="SWTC-XXXX-XXXX-XXXX"
                              className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2 text-sm font-mono tracking-wider uppercase focus:outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                        <span>
                          {mode === 'login' && '登入系統並開啟操作頁面'}
                          {mode === 'register' && '開通註冊並進入系統'}
                          {mode === 'forgot' && '確認送出重設需求'}
                        </span>
                      </button>
                    </form>

                    {/* Google OAuth One-Click Button (Placed below for both Login and Register) */}
                    {mode !== 'forgot' && (
                      <>
                        <div className="relative my-3">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-800" />
                          </div>
                          <div className="relative flex justify-center text-xs">
                            <span className="bg-gray-900 px-3 text-gray-500">
                              {mode === 'register' ? '或使用第三方帳號註冊' : '或使用第三方帳號登入'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleGoogleSignIn}
                          disabled={loading}
                          className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 text-gray-200 font-medium py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-3 transition-colors cursor-pointer shadow-sm"
                        >
                          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                            />
                          </svg>
                          <span>
                            {mode === 'register' ? '以 Google 帳號直接開通註冊' : '以 Google 帳號直接登入'}
                          </span>
                        </button>
                      </>
                    )}

                    {mode === 'forgot' && (
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => handleModeSwitch('login')}
                          className="text-xs text-blue-400 hover:underline"
                        >
                          返回帳號登入
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="bg-gray-950/60 p-3.5 border-t border-gray-800/80 text-center">
                <p className="text-[11px] text-gray-500 flex items-center justify-center gap-1.5">
                  <ShieldCheck size={13} className="text-gray-400" />
                  <span>內部安全系統 • 一組帳號僅限一台電腦在線使用</span>
                </p>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* Page Footer */}
      <footer className="relative z-10 w-full px-6 py-3 border-t border-gray-800/80 bg-gray-900/40 text-center text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>© 2026 SWTC 設備工程 • Formlabs Form 4 SLA Optimization System</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span>管理員聯絡：karta1685232@gmail.com</span>
          <span className="text-gray-700">|</span>
          <span>機密等級：內部管制</span>
        </div>
      </footer>
    </div>
  );
};

export default LoginPage;
