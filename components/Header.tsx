import React from 'react';
import { Box, LogIn, LogOut, Users, Clock, ShieldCheck, Crown, User as UserIcon, Calendar, AlertTriangle } from 'lucide-react';
import { UserProfile, getAccountExpirationInfo, OWNER_EMAIL } from '../services/firebase';

interface HeaderProps {
  user: UserProfile | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onOpenProjects: () => void;
  onOpenAdmin: () => void;
}

const Header: React.FC<HeaderProps> = ({
  user,
  onOpenAuth,
  onSignOut,
  onOpenProjects,
  onOpenAdmin
}) => {
  const expInfo = user ? getAccountExpirationInfo(user) : null;

  return (
    <div className="p-3 sm:p-4 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-blue-950/40 via-gray-900 to-gray-900">
      {/* Left: Brand / Title */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white shadow-[0_0_15px_rgba(59,130,246,0.5)] shrink-0">
          <Box size={20} />
        </div>
        <div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-none">SWTC 設備工程</h1>
          <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold mt-1">Formlabs SLA optimizer</p>
        </div>
      </div>

      {/* Right: Auth & User Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* History Records Button */}
            <button
              onClick={onOpenProjects}
              className="px-2.5 py-1.5 rounded-lg bg-gray-800/90 hover:bg-gray-700/80 border border-gray-700/70 text-gray-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="查看雲端分析紀錄"
            >
              <Clock size={14} className="text-blue-400" />
              <span className="hidden md:inline">雲端紀錄</span>
            </button>

            {/* Admin Management Button (only for admin) */}
            {user.role === 'admin' && (
              <button
                onClick={onOpenAdmin}
                className="px-2.5 py-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/60 text-amber-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                title="增減管理員與准入管制控制台 (管理員專用)"
              >
                <Crown size={14} className="text-amber-400" />
                <span className="hidden md:inline">管理員控制台</span>
              </button>
            )}

            {/* Expiration Date Indicator for Non-Admin Users */}
            {expInfo && !expInfo.isPermanent && (
              <div 
                className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  expInfo.isExpired
                    ? 'bg-red-950/60 text-red-300 border-red-800/80 animate-pulse'
                    : expInfo.isExpiringSoon
                    ? 'bg-amber-950/60 text-amber-300 border-amber-800/70'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                }`}
                title={`帳號有效期限至 ${expInfo.formattedDate} (剩餘 ${expInfo.daysRemaining} 天)`}
              >
                <Calendar size={13} className={expInfo.isExpired ? 'text-red-400' : expInfo.isExpiringSoon ? 'text-amber-400' : 'text-emerald-400'} />
                <span className="whitespace-nowrap">
                  到期日: <span className="font-mono font-semibold">{expInfo.formattedDate}</span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  expInfo.isExpired 
                    ? 'bg-red-500/30 text-red-200' 
                    : expInfo.isExpiringSoon 
                    ? 'bg-amber-500/30 text-amber-200' 
                    : 'bg-emerald-500/20 text-emerald-200'
                }`}>
                  {expInfo.isExpired ? '已到期' : `剩餘 ${expInfo.daysRemaining} 天`}
                </span>
              </div>
            )}

            {/* User Profile Badge */}
            {(() => {
              const isOwner = (user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();
              return (
                <div className="flex items-center gap-2 pl-1 border-l border-gray-800">
                  <div className={`w-7 h-7 rounded-full border flex items-center justify-center font-semibold text-xs ${
                    isOwner 
                      ? 'bg-amber-600/30 border-amber-500/50 text-amber-300' 
                      : 'bg-blue-600/30 border-blue-500/40 text-blue-300'
                  }`}>
                    {isOwner ? <Crown size={14} /> : (user.displayName?.[0] || user.email[0] || 'U').toUpperCase()}
                  </div>
                  <div className="hidden lg:block text-left">
                    <div className="text-xs font-medium text-gray-200 leading-tight max-w-[140px] truncate">
                      {isOwner ? '最高管理員' : (user.displayName || user.email)}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-medium ${
                        isOwner
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                          : user.role === 'admin' 
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                          : 'bg-gray-800 text-gray-400'
                      }`}>
                        {isOwner ? '最高管理員' : (user.role === 'admin' ? 'ADMIN (永久)' : 'USER')}
                      </span>
                      {expInfo && !expInfo.isPermanent && (
                        <span className="text-[10px] text-gray-400 font-mono sm:hidden">
                          至 {expInfo.formattedDate}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Sign Out Button */}
            <button
              onClick={onSignOut}
              className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-300 hover:bg-red-950/40 border border-transparent hover:border-red-900/60 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              title="登出帳號並返回登入頁面"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">登出</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-gray-400">訪客模式</span>
            <button
              onClick={onOpenAuth}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              <LogIn size={14} />
              <span>登入 / 註冊</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;
