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
import { X, Lock, Mail, User, AlertCircle, CheckCircle2, ShieldCheck, Loader2, Sparkles, KeyRound, ArrowLeft, Calendar, RefreshCw, Monitor } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (profile: UserProfile) => void;
  initialMode?: 'login' | 'register' | 'renew';
  messagePrompt?: string;
  initialEmail?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'login',
  messagePrompt,
  initialEmail = ''
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'renew'>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [renewInviteCode, setRenewInviteCode] = useState('');
  const [renewalEmail, setRenewalEmail] = useState(initialEmail);
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [sessionConflict, setSessionConflict] = useState<{
    deviceLabel: string;
    occupiedTime?: string;
    message?: string;
  } | null>(null);

  // Google First-Time Invite Code State
  const [pendingGoogleUser, setPendingGoogleUser] = useState<PendingGoogleUser | null>(null);
  const [googleInviteCode, setGoogleInviteCode] = useState('');

  if (!isOpen) return null;

  const resetForm = () => {
    setError(null);
    setSuccessMsg(null);
    setPassword('');
    setPendingGoogleUser(null);
    setGoogleInviteCode('');
    setRenewInviteCode('');
    setExpiredNotice(null);
    setSessionConflict(null);
  };

  const handleModeSwitch = (newMode: 'login' | 'register' | 'forgot' | 'renew') => {
    setMode(newMode);
    resetForm();
  };

  const handleClose = async () => {
    if (pendingGoogleUser) {
      await clearLocalSession();
    }
    resetForm();
    onClose();
  };

  const translateFirebaseError = (err: any): string => {
    const code = err?.code || '';
    const msg = err?.message || '';
    switch (code) {
      case 'auth/invalid-email':
        return '無效的電子郵件格式。';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return '帳號或密碼不正確，請重新檢查。';
      case 'auth/email-already-in-use':
        return '此電子郵件已被註冊，請直接切換至「登入帳號」。';
      case 'auth/weak-password':
        return '密碼長度過短，請輸入至少 6 個字元。';
      case 'auth/operation-not-allowed':
        return 'Firebase 尚未啟用「電子郵件/密碼」登入方式，請在 Firebase Console > Authentication > Sign-in method 中啟用。';
      case 'auth/popup-closed-by-user':
        return 'Google 登入視窗已關閉。';
      case 'auth/too-many-requests':
        return '嘗試次數過多被暫時鎖定，請稍候再試。';
      case 'auth/network-request-failed':
        return '網路連線異常，無法連接至 Firebase 驗證伺服器。';
      default:
        return code ? `驗證失敗 (${code}): ${msg}` : (msg || '驗證失敗，請檢查輸入或稍後再試。');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setError('請輸入電子郵件信箱。');
      return;
    }

    if (mode === 'forgot') {
      setSuccessMsg('已記錄重設請求。如忘記密碼，請聯繫系統管理員 (karta1685232@gmail.com) 協助重設。');
      return;
    }

    if (!password) {
      setError('請輸入密碼。');
      return;
    }

    try {
      setLoading(true);
      if (mode === 'login') {
        const profile = await loginWithCustomEmail(email.trim(), password);
        onSuccess?.(profile);
        onClose();
      } else {
        const profile = await registerWithCustomEmail(
          email.trim(), 
          password, 
          displayName.trim(), 
          inviteCode.trim()
        );
        onSuccess?.(profile);
        onClose();
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
        setExpiredNotice(err.message || '該帳號使用期限已到期。');
        setMode('renew');
        return;
      }
      setError(err?.message || '驗證失敗，請檢查輸入或稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMsg(null);
    setSessionConflict(null);
    try {
      setLoading(true);
      const res = await loginWithGoogle(mode === 'register' ? inviteCode : undefined);
      if (res.status === 'authenticated' && res.profile) {
        if (res.profile.status === 'disabled') {
          setError('該帳號目前已被停用，請聯繫系統管理員。');
          return;
        }
        onSuccess?.(res.profile);
        onClose();
      } else if (res.status === 'needs_invite' && res.pendingGoogleUser) {
        setPendingGoogleUser(res.pendingGoogleUser);
        setGoogleInviteCode('');
      } else if (res.status === 'expired_needs_renewal' && res.pendingGoogleUser) {
        setRenewalEmail(res.pendingGoogleUser.email);
        setExpiredNotice(`Google 帳號 (${res.pendingGoogleUser.email}) 授權期限已屆滿。請輸入管理員配發之「一次性授權邀請序號」以重新開通 1 年使用權限：`);
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
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'Google 登入失敗，請稍後再試。');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const targetEmail = (renewalEmail || email).trim();
    if (!targetEmail) {
      setError('請輸入欲續期開通之帳號 Email。');
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
      setSuccessMsg(`帳號續期成功！有效期限已延長 1 年${expDateStr ? `（至 ${expDateStr}）` : ''}，正在進入系統...`);
      setTimeout(() => {
        onSuccess?.(profile);
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err?.message || '續期驗證失敗，請確認序號是否正確或向管理員索取。');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteGoogleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleUser) return;
    setError(null);
    try {
      setLoading(true);
      const profile = await completeGoogleRegistrationWithCode(
        pendingGoogleUser.uid,
        pendingGoogleUser.email,
        pendingGoogleUser.displayName,
        googleInviteCode
      );
      onSuccess?.(profile);
      onClose();
    } catch (err: any) {
      setError(err?.message || '授權開通失敗，請檢查序號是否正確。');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelGooglePending = async () => {
    setPendingGoogleUser(null);
    setGoogleInviteCode('');
    setError(null);
    await clearLocalSession();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-md bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-transparent p-6 pb-4 border-b border-gray-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${
              pendingGoogleUser || mode === 'renew' ? 'bg-amber-600 shadow-amber-500/30' : 'bg-blue-600 shadow-blue-500/30'
            }`}>
              {pendingGoogleUser ? <KeyRound size={22} /> : mode === 'renew' ? <RefreshCw size={22} /> : <ShieldCheck size={22} />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {pendingGoogleUser && 'Google 帳號首次開通驗證'}
                {!pendingGoogleUser && mode === 'login' && '登入系統帳號'}
                {!pendingGoogleUser && mode === 'register' && '註冊使用者帳號'}
                {!pendingGoogleUser && mode === 'forgot' && '忘記密碼'}
                {!pendingGoogleUser && mode === 'renew' && '帳號期限屆滿 • 序號續期'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {pendingGoogleUser 
                  ? '內部管制系統 • 請輸入一次性邀請碼以建立工程師權限' 
                  : mode === 'renew'
                  ? '輸入新的一組授權邀請序號即可重新延長 1 年使用期限'
                  : 'SWTC Formlabs SLA 3D 列印優化系統'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
            title="關閉"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message prompt if triggered by guest action */}
        {messagePrompt && !pendingGoogleUser && mode !== 'renew' && (
          <div className="mx-6 mt-4 p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl text-blue-200 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="text-blue-400 shrink-0" />
            <span>{messagePrompt}</span>
          </div>
        )}

        {/* Tab switch for Login / Register (Only when not in pending Google or renew state) */}
        {!pendingGoogleUser && mode !== 'forgot' && mode !== 'renew' && (
          <div className="flex border-b border-gray-800 px-6 pt-3">
            <button
              onClick={() => handleModeSwitch('login')}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-all cursor-pointer ${
                mode === 'login'
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              登入帳號
            </button>
            <button
              onClick={() => handleModeSwitch('register')}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-all cursor-pointer ${
                mode === 'register'
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              快速註冊
            </button>
          </div>
        )}

        {/* Body content */}
        <div className="p-6 space-y-4">
          {sessionConflict && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2.5 text-xs animate-fade-in">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <Monitor size={18} className="text-amber-400 shrink-0" />
                <span>此帳號目前已在另一台電腦登入中</span>
              </div>
              <p className="text-gray-300 leading-relaxed text-xs">
                目前在線電腦：<span className="font-semibold text-amber-200 font-mono">{sessionConflict.deviceLabel}</span>
                {sessionConflict.occupiedTime ? `（最近活躍：${sessionConflict.occupiedTime}）` : ''}
              </p>
              <div className="p-3 bg-gray-950/70 border border-gray-800 rounded-lg text-[11px] text-gray-400 space-y-1.5">
                <p className="font-semibold text-gray-300 flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-blue-400" />
                  單一裝置在線安全防護機制：
                </p>
                <p>• 為防範帳號外洩與多人同時共用，系統規定一個帳號一次僅限登入一台電腦。</p>
                <p>• 請先至該電腦點擊右上角【登出】，本台電腦即可立即登入。</p>
                <p>• 若該電腦已關機，系統閒置 2.5 分鐘後將自動解鎖，或可請管理員於後台點擊【解除鎖定】。</p>
              </div>
              <button
                type="button"
                onClick={() => setSessionConflict(null)}
                className="text-xs text-amber-400 hover:text-amber-300 underline cursor-pointer inline-block mt-1"
              >
                關閉提示並重試
              </button>
            </div>
          )}

          {error && !sessionConflict && (
            <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-green-950/50 border border-green-800/80 rounded-xl text-green-200 text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Condition A: Account Expired Renewal */}
          {mode === 'renew' ? (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                  <Calendar size={15} />
                  <span>帳號使用期限已屆滿 (需序號續期)</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {expiredNotice || '此帳號已超過核定之使用期限。請輸入由管理員配發之一組「一次性授權邀請序號」，完成驗證後即可重新延長 1 年使用權限。'}
                </p>
              </div>

              <form onSubmit={handleRenewSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    續期帳號 (Email)
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="email"
                      required
                      value={renewalEmail || email}
                      onChange={(e) => {
                        setRenewalEmail(e.target.value);
                        setEmail(e.target.value);
                      }}
                      placeholder="name@company.com"
                      className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:border-amber-400 font-mono transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-amber-300">
                      一次性授權邀請序號 (Invitation Code) *
                    </label>
                    <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                      續期開通 1 年
                    </span>
                  </div>
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400" />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={renewInviteCode}
                      onChange={(e) => setRenewInviteCode(e.target.value.toUpperCase())}
                      placeholder="例如: SWTC-XXXX-XXXX"
                      className="w-full bg-gray-800/90 border border-amber-500/50 text-amber-100 placeholder-gray-500 font-mono tracking-wider rounded-xl pl-10 pr-3.5 py-2.5 text-sm uppercase focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    若手邊無序號，請聯繫系統管理員 (karta1685232@gmail.com) 取得新序號。
                  </p>
                </div>

                {password && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                      帳號密碼 (Password)
                    </label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('login')}
                    className="w-1/3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors cursor-pointer"
                  >
                    返回登入
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !renewInviteCode.trim()}
                    className="w-2/3 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg shadow-amber-600/30 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>驗證續期中...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>驗證序號並延長 1 年</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : pendingGoogleUser ? (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                  <KeyRound size={15} />
                  <span>Google 帳號首次登入，須驗證授權</span>
                </div>
                <div className="text-xs text-gray-200">
                  登入帳號：<span className="font-mono text-amber-300 font-medium">{pendingGoogleUser.email}</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  本系統僅授權核可人員使用。請輸入管理員核發之「一次性註冊授權邀請碼」，驗證後將立即開通此 Google 帳號之系統權限。
                </p>
              </div>

              <form onSubmit={handleCompleteGoogleAuth} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-amber-300">
                      輸入授權邀請碼 (Invitation Code) *
                    </label>
                    <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                      一次性核驗
                    </span>
                  </div>
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400" />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={googleInviteCode}
                      onChange={(e) => setGoogleInviteCode(e.target.value.toUpperCase())}
                      placeholder="例如: SWTC-XXXX-XXXX"
                      className="w-full bg-gray-800/90 border border-amber-500/50 text-amber-100 placeholder-gray-500 font-mono tracking-wider rounded-xl pl-10 pr-3.5 py-2.5 text-sm uppercase focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleCancelGooglePending}
                    className="w-1/3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors cursor-pointer"
                  >
                    取消 / 更換
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !googleInviteCode.trim()}
                    className="w-2/3 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg shadow-amber-600/30 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>驗證序號開通中...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>驗證序號並開通</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Condition B: Standard Email & Google Sign In */
            <>
              <form onSubmit={handleEmailAuth} className="space-y-3.5">
                {mode === 'register' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-amber-300">
                        註冊授權邀請碼 (Invitation Code)
                      </label>
                      <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                        管制必填
                      </span>
                    </div>
                    <div className="relative">
                      <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400" />
                      <input
                        type="text"
                        required
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="例如: SWTC-XXXX-XXXX"
                        className="w-full bg-gray-800/90 border border-amber-500/40 text-amber-100 placeholder-gray-500 font-mono tracking-wider rounded-xl pl-10 pr-3.5 py-2.5 text-sm uppercase focus:outline-none focus:border-amber-400 transition-colors"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      本系統僅供授權內部工程師使用，若無授權序號請向系統管理員索取。
                    </p>
                  </div>
                )}

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  顯示名稱 / 使用者姓名
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="例如: 設備工程師 陳小明"
                    className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                電子郵件 (Email)
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-300">
                    密碼
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
                    className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              <span>
                {mode === 'login' && '立即登入'}
                {mode === 'register' && '完成註冊並登入'}
                {mode === 'forgot' && '寄送重設密碼連結'}
              </span>
            </button>
          </form>

          {mode === 'forgot' ? (
            <div className="text-center pt-2">
              <button
                onClick={() => handleModeSwitch('login')}
                className="text-xs text-blue-400 hover:underline"
              >
                返回登入
              </button>
            </div>
          ) : (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-800" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-gray-900 px-3 text-gray-500">或使用第三方帳號</span>
                </div>
              </div>

              {/* Google Sign In */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-gray-800 hover:bg-gray-700/80 border border-gray-700 text-gray-200 font-medium py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-3 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                  {mode === 'register' ? '以 Google 帳號綁定邀請碼註冊' : '以 Google 帳號直接登入'}
                </span>
              </button>
              {mode === 'register' && (
                <p className="text-[11px] text-gray-400 text-center">
                  亦可填寫上方邀請碼後直接以 Google 帳號開通身分
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>

        {/* Footer info */}
        <div className="bg-gray-950/60 p-3.5 border-t border-gray-800/80 text-center">
          <p className="text-[11px] text-gray-500">
            登入即代表您同意本系統之工程使用條款與資安規範
          </p>
        </div>
      </div>
    </div>
  );
};
