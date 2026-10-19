import React, { useState, useEffect } from 'react';
import { 
  UserProfile, 
  InviteCode,
  fetchAllUsers, 
  updateUserRoleOrStatus, 
  updateUserExpirationDate,
  getAccountExpirationInfo,
  calculateDefaultExpiration,
  fetchInviteCodes, 
  generateInviteCode, 
  revokeInviteCode, 
  deleteInviteCode,
  deleteInviteCodes,
  adminDirectCreateUser,
  assignAdminRoleByEmail,
  forceReleaseUserSession,
  OWNER_EMAIL
} from '../services/firebase';
import { DateDropdownPicker } from './DateDropdownPicker';
import { 
  X, 
  Users, 
  CheckCircle2, 
  Ban, 
  Search, 
  RefreshCw, 
  Crown, 
  KeyRound, 
  Plus, 
  Copy, 
  Check, 
  UserPlus, 
  Sparkles, 
  ShieldCheck, 
  AlertCircle, 
  UserCheck, 
  UserMinus, 
  Mail, 
  Filter,
  Trash2,
  CheckSquare,
  Square,
  Calendar,
  CalendarDays,
  Clock,
  Monitor,
  MonitorX
} from 'lucide-react';

interface AdminUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
}

export const AdminUserModal: React.FC<AdminUserModalProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'admins' | 'users' | 'invites'>('admins');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [userFilterRole, setUserFilterRole] = useState<'all' | 'admin' | 'user'>('all');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  // Tab 1: Admin Search & Promotion States
  const [adminSearchType, setAdminSearchType] = useState<'name' | 'email'>('name');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [assigningAdmin, setAssigningAdmin] = useState(false);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState<string | null>(null);
  const [assignErrorMsg, setAssignErrorMsg] = useState<string | null>(null);

  // Tab 2: User Directory Search States
  const [userSearchType, setUserSearchType] = useState<'all' | 'name' | 'email'>('all');
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // New Invite Code Form
  const [showNewInviteForm, setShowNewInviteForm] = useState(false);
  const [inviteNote, setInviteNote] = useState('');
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Direct User Creation Form
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [newUserExpiryDate, setNewUserExpiryDate] = useState<string>('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);

  // Edit Expiration Date Dialog
  const [editingExpiryUser, setEditingExpiryUser] = useState<UserProfile | null>(null);
  const [selectedExpiryDate, setSelectedExpiryDate] = useState<string>('');
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [expiryError, setExpiryError] = useState<string | null>(null);

  // In-app Universal Confirmation Modal (avoids iframe window.confirm blockage)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmTone: 'amber' | 'red' | 'purple' | 'blue';
    iconType: 'crown' | 'ban' | 'user' | 'key' | 'trash';
    action: () => Promise<void>;
  } | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Invite code selection state for single / batch operations
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [inviteStatusFilter, setInviteStatusFilter] = useState<'all' | 'active' | 'used' | 'revoked'>('all');

  // Global Notification Banner
  const [banner, setBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showBanner = (type: 'success' | 'error' | 'info', message: string) => {
    setBanner({ type, message });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [uData, cData] = await Promise.all([
        fetchAllUsers(),
        fetchInviteCodes()
      ]);
      setUsers(uData);
      setInviteCodes(cData);
    } catch (e) {
      console.error('Failed to load admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setAssignSuccessMsg(null);
      setAssignErrorMsg(null);
      setBanner(null);
      setConfirmDialog(null);
      setSelectedInviteIds([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Check if a user is the root owner
  const isUserOwner = (user: UserProfile) => {
    return (user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();
  };

  const isCurrentUser = (user: UserProfile) => {
    return (
      (Boolean(user.uid) && Boolean(currentUser.uid) && user.uid === currentUser.uid) ||
      (Boolean(user.email) && Boolean(currentUser.email) && user.email.toLowerCase() === currentUser.email.toLowerCase())
    );
  };

  // Safe promote / demote Role handler with In-Modal Confirmation
  const requestRoleChange = (user: UserProfile, targetRole: 'admin' | 'user') => {
    if (isCurrentUser(user)) {
      showBanner('error', '無法修改您自己的管理員權限，以防遺失系統操作權限。');
      return;
    }
    if (isUserOwner(user) && targetRole !== 'admin') {
      showBanner('error', '此帳號為系統最高擁有者 (Super Admin)，受安全保護機制限制，無法解除管理員權限。');
      return;
    }

    const isPromote = targetRole === 'admin';
    const targetName = user.displayName || user.email;

    setConfirmDialog({
      title: isPromote ? '確認指派為系統管理員' : '確認解除管理員職務',
      message: isPromote 
        ? `確定要將「${targetName}」(${user.email}) 提拔為【系統管理員 (Admin)】嗎？\n\n賦予管理員身分後，該人員可存取本管理控制台、管理名冊與派發註冊授權碼。`
        : `確定要解除「${targetName}」(${user.email}) 的管理員職務，降為【一般工程師 (User)】嗎？\n\n降級後該帳號將無法再存取管理員專屬功能。`,
      confirmLabel: isPromote ? '確認設為管理員' : '確認解除職務',
      confirmTone: isPromote ? 'amber' : 'red',
      iconType: isPromote ? 'crown' : 'user',
      action: async () => {
        try {
          setUpdatingUid(user.uid || user.email);
          await updateUserRoleOrStatus(user.uid, user.email, { role: targetRole });
          setUsers(prev => prev.map(u => 
            (u.uid === user.uid || (u.email && u.email.toLowerCase() === user.email.toLowerCase()))
              ? { ...u, role: targetRole }
              : u
          ));
          await loadData();
          showBanner('success', isPromote 
            ? `已成功將 ${user.email} 提拔為系統管理員！` 
            : `已成功解除 ${user.email} 的管理員權限。`);
        } catch (err: any) {
          showBanner('error', err?.message || '更新管理員權限失敗，請稍後再試。');
        } finally {
          setUpdatingUid(null);
        }
      }
    });
  };

  // Safe status toggle (disable/enable) with In-Modal Confirmation
  const requestStatusToggle = (user: UserProfile) => {
    if (isCurrentUser(user)) {
      showBanner('error', '無法停用您自己的帳號。');
      return;
    }
    if (isUserOwner(user)) {
      showBanner('error', '系統最高擁有者 (Super Admin) 受安全保護機制限制，無法被停用。');
      return;
    }

    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    const isDisabling = newStatus === 'disabled';
    const targetName = user.displayName || user.email;

    setConfirmDialog({
      title: isDisabling ? '確認停用帳號' : '確認重新啟用帳號',
      message: isDisabling
        ? `確定要停用「${targetName}」(${user.email}) 的帳號嗎？\n\n停用後該人員將無法登入系統執行任何作業。`
        : `確定要重新啟用「${targetName}」(${user.email}) 的帳號嗎？\n\n啟用後該人員即可正常登入並使用系統。`,
      confirmLabel: isDisabling ? '確認停用帳號' : '確認重新啟用',
      confirmTone: isDisabling ? 'red' : 'blue',
      iconType: isDisabling ? 'ban' : 'user',
      action: async () => {
        try {
          setUpdatingUid(user.uid || user.email);
          await updateUserRoleOrStatus(user.uid, user.email, { status: newStatus });
          setUsers(prev => prev.map(u => 
            (u.uid === user.uid || (u.email && u.email.toLowerCase() === user.email.toLowerCase()))
              ? { ...u, status: newStatus }
              : u
          ));
          await loadData();
          showBanner('success', isDisabling 
            ? `已成功停用 ${user.email} 的帳號。` 
            : `已成功重新啟用 ${user.email} 的帳號。`);
        } catch (err: any) {
          showBanner('error', err?.message || '更新帳號狀態失敗，請稍後再試。');
        } finally {
          setUpdatingUid(null);
        }
      }
    });
  };

  // Safe Force Release Session Lock with In-Modal Confirmation
  const requestReleaseSession = (user: UserProfile) => {
    const targetName = user.displayName || user.email;
    setConfirmDialog({
      title: '確認強制解除在線連線鎖定',
      message: `確定要強制解除「${targetName}」(${user.email}) 目前的在線連線鎖定嗎？\n\n解除後，若該人員切換至其他電腦，即可立刻登入使用。`,
      confirmLabel: '確認解除在線鎖定',
      confirmTone: 'amber',
      iconType: 'user',
      action: async () => {
        try {
          setUpdatingUid(user.uid || user.email);
          await forceReleaseUserSession(user.email, user.uid);
          setUsers(prev => prev.map(u => 
            (u.uid === user.uid || (u.email && u.email.toLowerCase() === user.email.toLowerCase()))
              ? { ...u, activeSession: null }
              : u
          ));
          await loadData();
          showBanner('success', `已成功解除 ${user.email} 的在線電腦連線鎖定！`);
        } catch (err: any) {
          showBanner('error', err?.message || '解除在線鎖定失敗，請稍後再試。');
        } finally {
          setUpdatingUid(null);
        }
      }
    });
  };

  // Safe Revoke Invite Code with In-Modal Confirmation
  const requestRevokeInvite = (item: InviteCode) => {
    setConfirmDialog({
      title: '確認作廢註冊邀請碼',
      message: `確定要作廢邀請授權碼「${item.code}」${item.note ? `（用途備註：${item.note}）` : ''} 嗎？\n\n作廢後該序號將立即失效，無法再被任何人員兌換註冊。`,
      confirmLabel: '確認作廢序號',
      confirmTone: 'red',
      iconType: 'key',
      action: async () => {
        try {
          setUpdatingUid(item.id);
          await revokeInviteCode(item.id);
          setInviteCodes(prev => prev.map(c => c.id === item.id ? { ...c, status: 'revoked' } : c));
          await loadData();
          showBanner('success', `邀請序號「${item.code}」已成功作廢！`);
        } catch (err: any) {
          showBanner('error', err?.message || '作廢邀請碼失敗，請稍後再試。');
        } finally {
          setUpdatingUid(null);
        }
      }
    });
  };

  // Safe Permanent Delete for a Single Invite Code
  const requestDeleteSingleInvite = (item: InviteCode) => {
    setConfirmDialog({
      title: '確認永久清除邀請序號',
      message: `確定要永久清除邀請授權碼「${item.code}」${item.note ? `（用途備註：${item.note}）` : ''} 嗎？\n\n此動作將自資料庫中徹底刪除該序號，以避免累積過多無用資料。此操作無法復原。`,
      confirmLabel: '確認永久清除',
      confirmTone: 'red',
      iconType: 'trash',
      action: async () => {
        try {
          setUpdatingUid(item.id);
          await deleteInviteCode(item.id);
          setSelectedInviteIds(prev => prev.filter(id => id !== item.id));
          setInviteCodes(prev => prev.filter(c => c.id !== item.id && c.code !== item.code));
          await loadData();
          showBanner('success', `邀請授權碼「${item.code}」已徹底清除！`);
        } catch (err: any) {
          showBanner('error', err?.message || '清除邀請序號失敗，請稍後再試。');
        } finally {
          setUpdatingUid(null);
        }
      }
    });
  };

  // Safe Permanent Batch Delete for Selected Invite Codes
  const requestDeleteSelectedInvites = () => {
    if (selectedInviteIds.length === 0) return;
    const count = selectedInviteIds.length;

    setConfirmDialog({
      title: '確認批次清除邀請序號',
      message: `確定要永久清除已勾選的 ${count} 組邀請授權碼嗎？\n\n此動作將自資料庫徹底刪除這 ${count} 筆邀請紀錄，避免累積過多無用資料。此操作無法復原。`,
      confirmLabel: `確認清除 ${count} 組序號`,
      confirmTone: 'red',
      iconType: 'trash',
      action: async () => {
        try {
          setUpdatingUid('batch-delete');
          const res = await deleteInviteCodes(selectedInviteIds);
          setSelectedInviteIds([]);
          await loadData();
          showBanner('success', `已成功永久清除 ${res.successCount} 組邀請序號！${res.failCount > 0 ? `（${res.failCount} 組刪除失敗）` : ''}`);
        } catch (err: any) {
          showBanner('error', err?.message || '批次清除邀請碼失敗，請稍後再試。');
        } finally {
          setUpdatingUid(null);
        }
      }
    });
  };

  // Toggle selection for a single invite
  const handleToggleSelectInvite = (id: string) => {
    setSelectedInviteIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Toggle select all / deselect all for filtered invites
  const handleToggleSelectAllInvites = (visibleIds: string[]) => {
    if (visibleIds.length === 0) return;
    const allSelected = visibleIds.every(id => selectedInviteIds.includes(id));
    if (allSelected) {
      // Unselect only the visible ones
      setSelectedInviteIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      // Merge all visible ones
      setSelectedInviteIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Assign Admin directly by Email
  const handleAssignAdminByEmail = async (targetEmail?: string) => {
    const cleanEmail = (targetEmail || adminSearchQuery).trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showBanner('error', '請輸入正確的電子郵件信箱。');
      return;
    }

    setAssignErrorMsg(null);
    setAssignSuccessMsg(null);
    setAssigningAdmin(true);

    try {
      await assignAdminRoleByEmail(cleanEmail, 'admin');
      await loadData();
      const successText = `成功將 ${cleanEmail} 指派為系統管理員！該人員登入後即可直接進入管理控制台。`;
      setAssignSuccessMsg(successText);
      showBanner('success', successText);
      setAdminSearchQuery('');
    } catch (err: any) {
      const errorText = err?.message || '指派管理員失敗';
      setAssignErrorMsg(errorText);
      showBanner('error', errorText);
    } finally {
      setAssigningAdmin(false);
    }
  };

  const handleCreateInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGeneratingInvite(true);
      const newCode = await generateInviteCode(currentUser.email, inviteNote);
      setInviteCodes(prev => [newCode, ...prev]);
      setInviteNote('');
      setShowNewInviteForm(false);
      handleCopy(newCode.code);
      showBanner('success', `已成功生成新邀請碼 ${newCode.code}，並自動複製至剪貼簿！`);
    } catch (err: any) {
      showBanner('error', '生成邀請碼失敗：' + (err?.message || '未知錯誤'));
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleDirectCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserError(null);
    try {
      setCreatingUser(true);
      const created = await adminDirectCreateUser(
        newEmail, 
        newPassword, 
        newName, 
        newRole,
        newRole === 'admin' ? undefined : newUserExpiryDate
      );
      setUsers(prev => [created, ...prev]);
      await loadData();
      setShowNewUserModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      showBanner('success', `已成功建立${created.role === 'admin' ? '系統管理員' : '工程師'}帳號：${created.email}`);
    } catch (err: any) {
      setCreateUserError(err?.message || '建立帳號失敗');
    } finally {
      setCreatingUser(false);
    }
  };

  const openCreateAdminModal = () => {
    setNewRole('admin');
    setShowNewUserModal(true);
  };

  const openCreateUserModal = () => {
    setNewRole('user');
    const d = new Date(calculateDefaultExpiration());
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setNewUserExpiryDate(`${yyyy}-${mm}-${dd}`);
    setShowNewUserModal(true);
  };

  const openEditExpirationModal = (user: UserProfile) => {
    const info = getAccountExpirationInfo(user);
    setEditingExpiryUser(user);
    setSelectedExpiryDate(info.dateInputValue);
    setExpiryError(null);
  };

  const applyExpiryPreset = (monthsToAdd: number) => {
    let base = new Date();
    if (editingExpiryUser) {
      const info = getAccountExpirationInfo(editingExpiryUser);
      if (!info.isExpired && info.rawIso) {
        const exp = new Date(info.rawIso);
        if (!isNaN(exp.getTime()) && exp.getTime() > Date.now()) {
          base = exp;
        }
      }
    }
    const d = new Date(base);
    d.setMonth(d.getMonth() + monthsToAdd);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedExpiryDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleSaveExpirationDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpiryUser) return;
    if (!selectedExpiryDate) {
      setExpiryError('請選擇最終到期日期。');
      return;
    }
    setSavingExpiry(true);
    setExpiryError(null);
    try {
      const updatedIso = await updateUserExpirationDate(
        editingExpiryUser.uid,
        editingExpiryUser.email,
        selectedExpiryDate
      );
      showBanner('success', `已成功更新「${editingExpiryUser.displayName || editingExpiryUser.email}」之使用期限至 ${selectedExpiryDate}！`);
      setUsers(prev => prev.map(u => {
        if ((u.uid && u.uid === editingExpiryUser.uid) || (u.email && u.email.toLowerCase() === editingExpiryUser.email.toLowerCase())) {
          return { ...u, expiresAt: updatedIso };
        }
        return u;
      }));
      setEditingExpiryUser(null);
    } catch (err: any) {
      setExpiryError(err?.message || '更新到期日失敗，請重試。');
    } finally {
      setSavingExpiry(false);
    }
  };

  // Filter lists
  const adminUsers = users.filter(u => u.role === 'admin');
  const regularUsers = users.filter(u => u.role !== 'admin');

  // Tab 1: Account Search for Promoting or Demoting Admins
  const searchedAdminUsers = users.filter(u => {
    const q = adminSearchQuery.trim().toLowerCase();
    if (!q) return false;
    const isOwner = isUserOwner(u);
    const displayName = isOwner ? '最高管理員' : (u.displayName || '');
    const email = (u.email || '').toLowerCase();

    if (adminSearchType === 'name') {
      return displayName.toLowerCase().includes(q) || (isOwner && ('最高管理員'.includes(q) || 'super admin'.includes(q) || '管理員'.includes(q)));
    } else {
      return email.includes(q);
    }
  });

  const filteredAdmins = adminUsers;

  // Tab 2: User Directory Search with Name/Email/All options
  const filteredUsers = users.filter(u => {
    const isOwner = isUserOwner(u);
    const displayName = isOwner ? '最高管理員' : (u.displayName || '');
    const email = (u.email || '').toLowerCase();
    const q = userSearchQuery.trim().toLowerCase();

    let matchSearch = true;
    if (q) {
      if (userSearchType === 'name') {
        matchSearch = displayName.toLowerCase().includes(q) || (isOwner && ('最高管理員'.includes(q) || 'super admin'.includes(q) || '管理員'.includes(q)));
      } else if (userSearchType === 'email') {
        matchSearch = email.includes(q);
      } else {
        matchSearch = displayName.toLowerCase().includes(q) || email.includes(q) || (isOwner && ('最高管理員'.includes(q) || 'super admin'.includes(q) || '管理員'.includes(q)));
      }
    }

    const matchRole = userFilterRole === 'all' 
      ? true 
      : userFilterRole === 'admin' 
        ? u.role === 'admin' 
        : u.role !== 'admin';

    return matchSearch && matchRole;
  });

  const filteredInvites = inviteCodes.filter(c => {
    const matchSearch = c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.note && c.note.toLowerCase().includes(search.toLowerCase())) ||
      (c.usedByEmail && c.usedByEmail.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = inviteStatusFilter === 'all' ? true : c.status === inviteStatusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div 
        className="w-full max-w-5xl bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-purple-900/20 via-blue-900/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>帳號與註冊准入管制控制台</span>
                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 font-medium">
                  管理員權限
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                增減指派管理員、管制工程師名冊、發行一次性邀請碼及監控系統存取
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
              title="重新整理資料"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
              title="關閉"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Switcher & Actions Bar */}
        <div className="px-5 pt-3 border-b border-gray-800/80 bg-gray-950/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Tab 1: Admins */}
            <button
              onClick={() => setActiveTab('admins')}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'admins'
                  ? 'border-amber-500 text-amber-300 font-bold'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <Crown size={15} className={activeTab === 'admins' ? 'text-amber-400' : 'text-gray-500'} />
              <span>👑 管理員名單與增減 ({adminUsers.length})</span>
            </button>

            {/* Tab 2: All Users */}
            <button
              onClick={() => setActiveTab('users')}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'users'
                  ? 'border-purple-500 text-purple-300 font-bold'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <Users size={15} className={activeTab === 'users' ? 'text-purple-400' : 'text-gray-500'} />
              <span>全體工程師名冊 ({users.length})</span>
            </button>

            {/* Tab 3: Invites */}
            <button
              onClick={() => setActiveTab('invites')}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'invites'
                  ? 'border-blue-500 text-blue-300 font-bold'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <KeyRound size={15} className={activeTab === 'invites' ? 'text-blue-400' : 'text-gray-500'} />
              <span>一次性註冊邀請碼 ({inviteCodes.filter(c => c.status === 'active').length} 組有效)</span>
            </button>
          </div>

          <div className="pb-2.5 flex items-center gap-2.5">
            {activeTab === 'admins' && (
              <button
                onClick={openCreateAdminModal}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-amber-600/20 transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>新建管理員帳號</span>
              </button>
            )}

            {activeTab === 'users' && (
              <button
                onClick={openCreateUserModal}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
              >
                <UserPlus size={14} />
                <span>手動新增帳號</span>
              </button>
            )}

            {activeTab === 'invites' && (
              <>
                <button
                  onClick={() => setShowNewInviteForm(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-amber-600/20 transition-all cursor-pointer"
                >
                  <Plus size={14} />
                  <span>生成新邀請授權碼</span>
                </button>

                <select
                  value={inviteStatusFilter}
                  onChange={(e) => setInviteStatusFilter(e.target.value as any)}
                  className="bg-gray-850 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                  title="依序號狀態篩選"
                >
                  <option value="all">全部狀態 ({inviteCodes.length})</option>
                  <option value="active">可使用 (有效) ({inviteCodes.filter(c => c.status === 'active').length})</option>
                  <option value="used">已完成兌換 ({inviteCodes.filter(c => c.status === 'used').length})</option>
                  <option value="revoked">已作廢 ({inviteCodes.filter(c => c.status === 'revoked').length})</option>
                </select>

                {selectedInviteIds.length > 0 && (
                  <button
                    type="button"
                    onClick={requestDeleteSelectedInvites}
                    disabled={updatingUid === 'batch-delete'}
                    className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-700/30 transition-all cursor-pointer disabled:opacity-50"
                    title="永久清除已勾選的所有邀請序號"
                  >
                    <Trash2 size={13} />
                    <span>清除所選 ({selectedInviteIds.length})</span>
                  </button>
                )}
              </>
            )}

            {activeTab === 'invites' && (
              <div className="relative w-44 sm:w-52">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋序號、備註或兌換者..."
                  className="w-full bg-gray-800/80 border border-gray-700 text-white rounded-lg pl-8 pr-2.5 py-1 text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Notification Banner */}
        {banner && (
          <div className={`mx-5 mt-3 p-3 rounded-xl text-xs flex items-center justify-between gap-2 border animate-fade-in ${
            banner.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800/90 text-emerald-200'
              : banner.type === 'error'
                ? 'bg-red-950/70 border-red-800/90 text-red-200'
                : 'bg-blue-950/70 border-blue-800/90 text-blue-200'
          }`}>
            <div className="flex items-center gap-2">
              {banner.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
              {banner.type === 'error' && <AlertCircle size={16} className="text-red-400 shrink-0" />}
              {banner.type === 'info' && <Sparkles size={16} className="text-blue-400 shrink-0" />}
              <span className="font-medium leading-relaxed">{banner.message}</span>
            </div>
            <button 
              onClick={() => setBanner(null)} 
              className="p-1 text-gray-400 hover:text-white rounded transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Inline Feedback Alerts */}
        {assignSuccessMsg && activeTab === 'admins' && !banner && (
          <div className="mx-5 mt-4 p-3 bg-green-950/50 border border-green-800/80 rounded-xl text-green-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              <span>{assignSuccessMsg}</span>
            </div>
            <button onClick={() => setAssignSuccessMsg(null)} className="text-green-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {assignErrorMsg && activeTab === 'admins' && !banner && (
          <div className="mx-5 mt-4 p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <span>{assignErrorMsg}</span>
            </div>
            <button onClick={() => setAssignErrorMsg(null)} className="text-red-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {/* New Invite Code Inline Form */}
        {showNewInviteForm && activeTab === 'invites' && (
          <div className="p-4 bg-amber-950/20 border-b border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in">
            <div className="flex-1 w-full">
              <div className="text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                <KeyRound size={14} />
                <span>建立一次性註冊邀請序號</span>
              </div>
              <p className="text-[11px] text-gray-400">
                可填寫備註（例如預計給予哪位工程師或部門），序號一旦被註冊成功將自動標記為已使用並記錄註冊者。
              </p>
            </div>
            <form onSubmit={handleCreateInviteCode} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={inviteNote}
                onChange={(e) => setInviteNote(e.target.value)}
                placeholder="備註: 例 機構研發部 林工程師"
                className="bg-gray-900 border border-amber-500/40 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-amber-400 w-full sm:w-64"
              />
              <button
                type="submit"
                disabled={generatingInvite}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs whitespace-nowrap cursor-pointer transition-colors"
              >
                {generatingInvite ? '生成中...' : '確認生成序號'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewInviteForm(false)}
                className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs cursor-pointer"
              >
                取消
              </button>
            </form>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
              <RefreshCw size={24} className="animate-spin text-purple-400" />
              <p className="text-xs">同步資料庫紀錄中...</p>
            </div>
          ) : activeTab === 'admins' ? (
            /* =========================================================================
               TAB 1: 👑 ADMINS MANAGEMENT (增減管理員專區)
               ========================================================================= */
            <div className="space-y-4">
              {/* Account Search for Role Promotion / Demotion */}
              <div className="p-4 bg-gray-800/60 border border-gray-700/80 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                    <Search size={16} />
                    <span>搜尋帳號增減管理員</span>
                  </div>
                  {/* Search Type Selector: Name vs Email */}
                  <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-lg border border-gray-700">
                    <button
                      type="button"
                      onClick={() => setAdminSearchType('name')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                        adminSearchType === 'name'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Users size={13} />
                      <span>依名稱搜尋</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminSearchType('email')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                        adminSearchType === 'email'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Mail size={13} />
                      <span>依 Email 搜尋</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  輸入欲調整權限的人員{adminSearchType === 'name' ? '姓名' : '電子郵件 (Email)'}，搜尋到人員後即可一鍵升級為管理員或解除管理員職務。
                </p>

                {/* Search Input Bar */}
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={adminSearchQuery}
                    onChange={(e) => setAdminSearchQuery(e.target.value)}
                    placeholder={
                      adminSearchType === 'name'
                        ? '輸入工程師姓名關鍵字搜尋（例：林工程師、陳組長）...'
                        : '輸入工程師 Email 關鍵字搜尋（例：engineer@company.com）...'
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                  />
                  {adminSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAdminSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-0.5 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Search Results Display Area */}
                {adminSearchQuery.trim() ? (
                  <div className="space-y-2 pt-1 border-t border-gray-700/60">
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>搜尋結果：共找到 {searchedAdminUsers.length} 筆符合條件的人員</span>
                    </div>

                    {searchedAdminUsers.length === 0 ? (
                      <div className="p-4 bg-gray-900/80 rounded-xl border border-gray-700/60 text-center space-y-2">
                        <p className="text-xs text-gray-400">
                          查無符合「<strong className="text-white">{adminSearchQuery}</strong>」的帳號紀錄
                        </p>
                        {adminSearchType === 'email' && adminSearchQuery.includes('@') && (
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleAssignAdminByEmail(adminSearchQuery)}
                              disabled={assigningAdmin}
                              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                            >
                              {assigningAdmin ? <RefreshCw size={13} className="animate-spin" /> : <Crown size={13} />}
                              <span>直接將「{adminSearchQuery}」預先指派為管理員</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-700/60 bg-gray-900/90 rounded-xl border border-gray-700/80 overflow-hidden">
                        {searchedAdminUsers.map((targetUser) => {
                          const isCurrent = isCurrentUser(targetUser);
                          const isOwner = isUserOwner(targetUser);
                          const isBusy = (Boolean(targetUser.uid) && updatingUid === targetUser.uid) || (Boolean(targetUser.email) && updatingUid === targetUser.email);
                          const isAdmin = targetUser.role === 'admin';

                          return (
                            <div key={targetUser.uid || targetUser.email} className="p-3 flex items-center justify-between gap-3 hover:bg-gray-800/40 transition-colors">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 ${
                                  isOwner 
                                    ? 'bg-amber-600/30 border-amber-500/50 text-amber-300' 
                                    : isAdmin
                                    ? 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                                    : 'bg-gray-700/80 border-gray-600 text-white'
                                }`}>
                                  {isOwner ? <Crown size={16} /> : (targetUser.displayName?.[0] || targetUser.email[0]).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-white text-xs flex items-center gap-1.5 flex-wrap">
                                    <span className="truncate">{isOwner ? '最高管理員' : (targetUser.displayName || '未設定姓名')}</span>
                                    {isCurrent && (
                                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-500/30">
                                        您本人
                                      </span>
                                    )}
                                    {isAdmin ? (
                                      <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.2 rounded text-[10px] font-bold">
                                        <Crown size={11} />
                                        {isOwner ? '最高管理員' : '系統管理員 (Admin)'}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.2 rounded text-[10px] font-medium">
                                        一般工程師 (User)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-400 text-[11px] font-mono truncate mt-0.5">
                                    {targetUser.email}
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                {isOwner ? (
                                  <span className="text-[11px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded">
                                    ⭐ 根擁有者 (保護中)
                                  </span>
                                ) : isCurrent ? (
                                  <span className="text-[11px] text-gray-400 bg-gray-800 px-2.5 py-1 rounded">
                                    當前登入帳號
                                  </span>
                                ) : isAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => requestRoleChange(targetUser, 'user')}
                                    disabled={isBusy}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-950/50 hover:bg-red-900/70 text-red-300 border border-red-800/80 disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                                    title="解除管理員權限並降為一般工程師"
                                  >
                                    <UserMinus size={13} />
                                    <span>{isBusy ? '處理中...' : '解除管理員'}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => requestRoleChange(targetUser, 'admin')}
                                    disabled={isBusy}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white shadow-md shadow-amber-600/30 transition-colors cursor-pointer flex items-center gap-1.5"
                                    title="將此工程師升級為系統管理員"
                                  >
                                    <Crown size={13} />
                                    <span>{isBusy ? '處理中...' : '升級為管理員'}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-800 text-[11px] text-gray-400 flex items-center gap-2">
                    <Sparkles size={14} className="text-amber-400 shrink-0" />
                    <span>請選擇【依名稱】或【依 Email】並輸入關鍵字搜尋人員，搜尋到後即可一鍵升級為管理員或解除管理員。</span>
                  </div>
                )}
              </div>

              {/* Current Admins List Table */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-3.5 bg-gray-800/60 border-b border-gray-700/70 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                    <Crown size={15} className="text-amber-400" />
                    <span>目前在任之系統管理員名冊 ({filteredAdmins.length} 位)</span>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    點擊「解除管理員」即可隨時將其降為一般工程師
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="bg-gray-800/40 text-gray-400 uppercase tracking-wider text-[11px] border-b border-gray-800">
                      <tr>
                        <th className="py-3 px-4">管理員身分</th>
                        <th className="py-3 px-4">管理層級與登入管道</th>
                        <th className="py-3 px-4">帳號狀態</th>
                        <th className="py-3 px-4">最近登入紀錄</th>
                        <th className="py-3 px-4 text-right">增減權限管理</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {filteredAdmins.map((admin) => {
                        const isCurrent = isCurrentUser(admin);
                        const isOwner = isUserOwner(admin);
                        const isBusy = (Boolean(admin.uid) && updatingUid === admin.uid) || (Boolean(admin.email) && updatingUid === admin.email);

                        return (
                          <tr key={admin.uid || admin.email} className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs border ${
                                  isOwner 
                                    ? 'bg-amber-600/30 border-amber-500/50 text-amber-300' 
                                    : 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                                }`}>
                                  {isOwner ? <Crown size={15} /> : (admin.displayName?.[0] || admin.email[0]).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-white flex items-center gap-1.5">
                                    <span>{isOwner ? '最高管理員' : (admin.displayName || '未設定名稱')}</span>
                                    {isCurrent && (
                                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-500/30">
                                        您本人
                                      </span>
                                    )}
                                  </div>
                                  {isOwner ? (
                                    <div className="text-amber-400/80 text-[11px] font-mono flex items-center gap-1">
                                      <ShieldCheck size={11} className="shrink-0" />
                                      <span>系統最高核心 (安全保密)</span>
                                    </div>
                                  ) : (
                                    <div className="text-gray-400 text-[11px] font-mono">{admin.email}</div>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="space-y-1">
                                {isOwner ? (
                                  <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md font-bold text-[11px]">
                                    <Sparkles size={12} />
                                    最高管理員 (Super Admin)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md font-medium text-[11px]">
                                    <Crown size={12} />
                                    系統管理員 (Admin)
                                  </span>
                                )}
                                <div className="text-[10px] text-gray-400">
                                  管道: {admin.authProvider === 'google' ? 'Google 帳號' : 'Email/密碼'}
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              {admin.status === 'active' ? (
                                <span className="inline-flex items-center gap-1 text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-md text-[11px]">
                                  <CheckCircle2 size={12} />
                                  正常啟用
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md text-[11px]">
                                  <Ban size={12} />
                                  已停用
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-gray-400 text-[11px]">
                              <div>註冊: {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : '-'}</div>
                              <div className="text-gray-400 text-[10px] mt-0.5">
                                最近: {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : '尚未登入'}
                                {admin.loginCount ? ` (${admin.loginCount}次)` : ''}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                {isOwner ? (
                                  <span className="text-[11px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded">
                                    ⭐ 根擁有者 (保護中)
                                  </span>
                                ) : isCurrent ? (
                                  <span className="text-[11px] text-gray-400 bg-gray-800 px-2.5 py-1 rounded">
                                    當前登入帳號
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => requestRoleChange(admin, 'user')}
                                      disabled={isBusy}
                                      className="px-2.5 py-1 text-[11px] rounded bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/60 disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1"
                                      title="解除管理員權限並降為一般使用者"
                                    >
                                      <UserMinus size={12} />
                                      <span>{isBusy ? '處理中...' : '解除管理員'}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => requestStatusToggle(admin)}
                                      disabled={isBusy}
                                      className={`px-2 py-1 text-[11px] rounded border disabled:opacity-40 transition-colors cursor-pointer ${
                                        admin.status === 'active'
                                          ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'
                                          : 'bg-green-950/30 hover:bg-green-900/40 text-green-300 border-green-800/40'
                                      }`}
                                    >
                                      {isBusy ? '處理中...' : admin.status === 'active' ? '停用' : '啟用'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'users' ? (
            /* =========================================================================
               TAB 2: 👥 ALL USERS DIRECTORY
               ========================================================================= */
            <div className="space-y-3">
              {/* Search & Filter Toolbar for Engineer Directory */}
              <div className="p-3.5 bg-gray-800/60 border border-gray-700/80 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {/* Search Type Selector + Input */}
                  <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {/* Search Field Buttons */}
                    <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-lg border border-gray-700 shrink-0">
                      <button
                        type="button"
                        onClick={() => setUserSearchType('all')}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                          userSearchType === 'all'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        全部欄位
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserSearchType('name')}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                          userSearchType === 'name'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        依姓名
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserSearchType('email')}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                          userSearchType === 'email'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        依 Email
                      </button>
                    </div>

                    {/* Search Input Box */}
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        placeholder={
                          userSearchType === 'name'
                            ? '輸入工程師姓名搜尋...'
                            : userSearchType === 'email'
                            ? '輸入帳號 Email 搜尋...'
                            : '搜尋工程師姓名或 Email...'
                        }
                        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg pl-9 pr-9 py-1.5 text-xs focus:outline-none focus:border-purple-500 placeholder-gray-500"
                      />
                      {userSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setUserSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-0.5 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Role filter buttons */}
                  <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-lg border border-gray-700 shrink-0">
                    <button
                      type="button"
                      onClick={() => setUserFilterRole('all')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                        userFilterRole === 'all' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      全部 ({users.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserFilterRole('user')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                        userFilterRole === 'user' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      工程師 ({regularUsers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserFilterRole('admin')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                        userFilterRole === 'admin' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      管理員 ({adminUsers.length})
                    </button>
                  </div>
                </div>

                {/* Filter / Search stats status */}
                {(userSearchQuery.trim() || userFilterRole !== 'all') && (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-700/60 text-[11px] text-gray-400">
                    <div className="flex items-center gap-2">
                      <span className="text-purple-300">
                        {userSearchQuery.trim() ? `搜尋「${userSearchQuery}」` : ''}
                        {userFilterRole !== 'all' ? ` (身分：${userFilterRole === 'admin' ? '管理員' : '一般工程師'})` : ''}
                      </span>
                      <span>— 顯示 <strong>{filteredUsers.length}</strong> / {users.length} 位名冊人員</span>
                    </div>
                    {(userSearchQuery || userFilterRole !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserSearchQuery('');
                          setUserFilterRole('all');
                        }}
                        className="text-purple-400 hover:text-purple-300 underline cursor-pointer text-[11px]"
                      >
                        重設搜尋與篩選
                      </button>
                    )}
                  </div>
                )}
              </div>

              {filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm space-y-2 bg-gray-900 border border-gray-800 rounded-xl">
                  <p>查無符合條件的工程師紀錄</p>
                  {(userSearchQuery || userFilterRole !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserSearchQuery('');
                        setUserFilterRole('all');
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 underline cursor-pointer"
                    >
                      清除搜尋與身分篩選
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="bg-gray-800/50 text-gray-400 uppercase tracking-wider text-[11px] border-b border-gray-700/50">
                      <tr>
                        <th className="py-3 px-4">使用者資訊</th>
                        <th className="py-3 px-4">身份與管道</th>
                        <th className="py-3 px-4">帳號狀態</th>
                        <th className="py-3 px-4">使用期限 (到期日)</th>
                        <th className="py-3 px-4">註冊 / 最後登入</th>
                        <th className="py-3 px-4 text-right">權限與到期日操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {filteredUsers.map((user) => {
                        const isCurrent = isCurrentUser(user);
                        const isOwner = isUserOwner(user);
                        const isBusy = (Boolean(user.uid) && updatingUid === user.uid) || (Boolean(user.email) && updatingUid === user.email);

                        return (
                          <tr key={user.uid || user.email} className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs border ${
                                  isOwner
                                    ? 'bg-amber-600/30 border-amber-500/50 text-amber-300'
                                    : 'bg-gray-700/80 border-gray-600 text-white'
                                }`}>
                                  {isOwner ? <Crown size={15} /> : (user.displayName?.[0] || user.email[0]).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-white flex items-center gap-1.5">
                                    <span>{isOwner ? '最高管理員' : (user.displayName || '未設定姓名')}</span>
                                    {isCurrent && (
                                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-500/30">
                                        目前操作中
                                      </span>
                                    )}
                                  </div>
                                  {isOwner ? (
                                    <div className="text-amber-400/80 text-[11px] font-mono flex items-center gap-1">
                                      <ShieldCheck size={11} className="shrink-0" />
                                      <span>系統最高核心 (安全保密)</span>
                                    </div>
                                  ) : (
                                    <div className="text-gray-400 text-[11px] font-mono">{user.email}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="space-y-1">
                                {isOwner ? (
                                  <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md font-bold text-[11px]">
                                    <Sparkles size={12} />
                                    最高管理員 (Super Admin)
                                  </span>
                                ) : user.role === 'admin' ? (
                                  <span className="inline-flex items-center gap-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md font-medium text-[11px]">
                                    <Crown size={12} />
                                    管理員 (Admin)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded-md font-medium text-[11px]">
                                    一般工程師 (User)
                                  </span>
                                )}
                                <div className="text-[10px] text-gray-400">
                                  管道: {user.authProvider === 'google' ? 'Google 帳號' : 'Email/密碼'}
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="space-y-1.5">
                                {user.status === 'active' ? (
                                  <span className="inline-flex items-center gap-1 text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-md text-[11px]">
                                    <CheckCircle2 size={12} />
                                    正常啟用
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md text-[11px]">
                                    <Ban size={12} />
                                    已停用
                                  </span>
                                )}

                                {(() => {
                                  const lastActiveTime = user.activeSession?.lastActiveAt || user.activeSession?.loggedInAt;
                                  const isOnline = Boolean(
                                    user.activeSession?.sessionId &&
                                    lastActiveTime &&
                                    Date.now() - new Date(lastActiveTime).getTime() < 150000
                                  );
                                  if (isOnline) {
                                    return (
                                      <div 
                                        className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-1.5 py-0.5 rounded w-fit"
                                        title={`在線裝置：${user.activeSession?.deviceLabel || '電腦'}\n登入時間：${user.activeSession?.loggedInAt ? new Date(user.activeSession.loggedInAt).toLocaleString() : '-'}`}
                                      >
                                        <Monitor size={11} className="text-emerald-400 shrink-0" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                        <span className="truncate max-w-[110px] font-mono">
                                          {user.activeSession?.deviceLabel || '在線電腦'}
                                        </span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                                      <span>目前離線</span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              {isOwner || user.role === 'admin' ? (
                                <span className="inline-flex items-center gap-1 text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md text-[11px] font-mono">
                                  <Crown size={11} />
                                  {isOwner ? '永久有效 (最高管理員)' : '永久有效 (管理者)'}
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  {(() => {
                                    const exp = getAccountExpirationInfo(user);
                                    return (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium ${
                                            exp.isExpired
                                              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                              : exp.isExpiringSoon
                                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                          }`}>
                                            <Calendar size={11} />
                                            <span>{exp.formattedDate}</span>
                                            {exp.isExpired && <span className="text-[10px] text-red-400 ml-0.5">(已逾期)</span>}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => openEditExpirationModal(user)}
                                          className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 hover:underline cursor-pointer transition-colors w-fit"
                                          title="調整該帳號的使用期限最終日期"
                                        >
                                          <CalendarDays size={12} />
                                          <span>設定 / 調整到期日</span>
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-gray-400 text-[11px]">
                              <div>註冊: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</div>
                              <div className="text-gray-400 text-[10px] mt-0.5">
                                最近: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '尚未登入'}
                                {user.loginCount ? ` (${user.loginCount}次)` : ''}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                {isOwner ? (
                                  <span className="text-[11px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded">
                                    ⭐ 最高管理員 (保護中)
                                  </span>
                                ) : isCurrent ? (
                                  <span className="text-[11px] text-gray-400 bg-gray-800 px-2.5 py-1 rounded">
                                    本人
                                  </span>
                                ) : (
                                  <>
                                    {(() => {
                                      const lastActiveTime = user.activeSession?.lastActiveAt || user.activeSession?.loggedInAt;
                                      const isOnline = Boolean(
                                        user.activeSession?.sessionId &&
                                        lastActiveTime &&
                                        Date.now() - new Date(lastActiveTime).getTime() < 150000
                                      );
                                      if (isOnline) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={() => requestReleaseSession(user)}
                                            disabled={isBusy}
                                            className="px-2.5 py-1 text-[11px] rounded border border-amber-500/40 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1"
                                            title="強制解除該帳號目前的在線電腦鎖定，使其可在其他電腦登入"
                                          >
                                            <MonitorX size={12} />
                                            <span>解除鎖定</span>
                                          </button>
                                        );
                                      }
                                      return null;
                                    })()}
                                    <button
                                      type="button"
                                      onClick={() => requestRoleChange(user, user.role === 'admin' ? 'user' : 'admin')}
                                      disabled={isBusy}
                                      className={`px-2.5 py-1 text-[11px] rounded border disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1 ${
                                        user.role === 'admin'
                                          ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-800/60'
                                          : 'bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border-purple-800/60'
                                      }`}
                                      title="切換管理員/使用者身分"
                                    >
                                      <Crown size={12} />
                                      <span>{isBusy ? '處理中...' : user.role === 'admin' ? '解除管理員' : '設為管理員'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => requestStatusToggle(user)}
                                      disabled={isBusy}
                                      className={`px-2.5 py-1 text-[11px] rounded border disabled:opacity-40 transition-colors cursor-pointer ${
                                        user.status === 'active'
                                          ? 'bg-red-950/30 hover:bg-red-900/40 text-red-300 border-red-800/40'
                                          : 'bg-green-950/30 hover:bg-green-900/40 text-green-300 border-green-800/40'
                                      }`}
                                      title={user.status === 'active' ? '停用帳號' : '重新啟用'}
                                    >
                                      {isBusy ? '處理中...' : user.status === 'active' ? '停用' : '啟用'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* =========================================================================
               TAB 3: 🔑 ONE-TIME INVITATION CODES
               ========================================================================= */
            filteredInvites.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm space-y-2">
                <div>
                  {inviteCodes.length === 0
                    ? '目前尚無邀請序號，點選上方「生成新邀請授權碼」即可派發。'
                    : '查無符合條件的邀請序號。'}
                </div>
                {inviteStatusFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setInviteStatusFilter('all')}
                    className="text-xs text-amber-400 hover:text-amber-300 underline cursor-pointer"
                  >
                    查看全部狀態序號 ({inviteCodes.length})
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Batch Selection Action Bar */}
                {selectedInviteIds.length > 0 && (
                  <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs animate-fade-in shadow-lg shadow-red-950/20">
                    <div className="flex items-center gap-2 text-red-200 font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                      <span>已選取 <strong className="text-white text-sm font-mono">{selectedInviteIds.length}</strong> 組邀請序號</span>
                      <span className="text-gray-400 text-[11px] hidden sm:inline">（可勾選單一或多選進行徹底清除，避免資料庫累積過多過期紀錄）</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedInviteIds([])}
                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer text-xs"
                      >
                        取消選取
                      </button>
                      <button
                        type="button"
                        onClick={requestDeleteSelectedInvites}
                        disabled={updatingUid === 'batch-delete'}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all cursor-pointer disabled:opacity-50 text-xs"
                      >
                        {updatingUid === 'batch-delete' ? (
                          <RefreshCw size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        <span>{updatingUid === 'batch-delete' ? '批次清除中...' : `清除所選 (${selectedInviteIds.length})`}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="bg-gray-800/50 text-gray-400 uppercase tracking-wider text-[11px] border-b border-gray-700/50">
                      <tr>
                        <th className="py-3 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={filteredInvites.length > 0 && filteredInvites.every(i => selectedInviteIds.includes(i.id))}
                            onChange={() => handleToggleSelectAllInvites(filteredInvites.map(i => i.id))}
                            className="rounded border-gray-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-gray-900 bg-gray-800 cursor-pointer w-4 h-4"
                            title="全選 / 取消全選本頁篩選結果"
                          />
                        </th>
                        <th className="py-3 px-4">邀請授權碼 (Code)</th>
                        <th className="py-3 px-4">序號備註用途</th>
                        <th className="py-3 px-4">目前狀態</th>
                        <th className="py-3 px-4">兌換使用者</th>
                        <th className="py-3 px-4">生成時間</th>
                        <th className="py-3 px-4 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60 font-mono">
                      {filteredInvites.map((item) => {
                        const isActive = item.status === 'active';
                        const isUsed = item.status === 'used';
                        const isRevoked = item.status === 'revoked';
                        const isBusy = updatingUid === item.id || updatingUid === 'batch-delete';
                        const isSelected = selectedInviteIds.includes(item.id);

                        return (
                          <tr 
                            key={item.id} 
                            className={`transition-colors ${
                              isSelected ? 'bg-red-950/20 hover:bg-red-950/30' : 'hover:bg-gray-800/30'
                            }`}
                          >
                            <td className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectInvite(item.id)}
                                className="rounded border-gray-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-gray-900 bg-gray-800 cursor-pointer w-4 h-4"
                                title={`勾選序號 ${item.code}`}
                              />
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white tracking-wider text-xs bg-gray-800 px-2 py-1 rounded border border-gray-700">
                                  {item.code}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(item.code)}
                                  className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors cursor-pointer"
                                  title="複製序號"
                                >
                                  {copiedCode === item.code ? (
                                    <Check size={14} className="text-green-400" />
                                  ) : (
                                    <Copy size={14} />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-300 font-sans">
                              {item.note || <span className="text-gray-500">無備註</span>}
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {isActive && (
                                <span className="inline-flex items-center gap-1 text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded text-[11px] font-medium">
                                  可使用 (有效)
                                </span>
                              )}
                              {isUsed && (
                                <span className="inline-flex items-center gap-1 text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded text-[11px]">
                                  已完成兌換
                                </span>
                              )}
                              {isRevoked && (
                                <span className="inline-flex items-center gap-1 text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded text-[11px]">
                                  已作廢
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-sans text-xs">
                              {item.usedByEmail ? (
                                <div className="text-white">
                                  <div>{(item.usedByEmail.toLowerCase() === OWNER_EMAIL.toLowerCase()) ? '最高管理員' : item.usedByEmail}</div>
                                  <div className="text-[10px] text-gray-500 font-mono">
                                    {item.usedAt ? new Date(item.usedAt).toLocaleString() : ''}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-gray-400 text-[11px] font-sans">
                              {new Date(item.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-sans">
                              <div className="flex items-center justify-end gap-1.5">
                                {isActive && (
                                  <button
                                    type="button"
                                    onClick={() => requestRevokeInvite(item)}
                                    disabled={isBusy}
                                    className="px-2 py-1 text-[11px] rounded bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 border border-amber-800/40 disabled:opacity-40 transition-colors cursor-pointer"
                                    title="作廢此序號（保留紀錄但失效）"
                                  >
                                    {updatingUid === item.id ? '作廢中...' : '作廢'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => requestDeleteSingleInvite(item)}
                                  disabled={isBusy}
                                  className="px-2 py-1 text-[11px] rounded bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 hover:border-red-700 disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1"
                                  title="永久清除此序號紀錄（從資料庫徹底刪除）"
                                >
                                  <Trash2 size={12} />
                                  <span>{updatingUid === item.id ? '清除中...' : '清除'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer info */}
        <div className="bg-gray-950/60 p-3 border-t border-gray-800/80 flex items-center justify-between text-[11px] text-gray-500 px-5">
          <div className="flex items-center gap-2">
            <span>操作者身份：{isUserOwner(currentUser) ? '最高管理員' : currentUser.email}</span>
            <span className="text-amber-400 font-medium">({isUserOwner(currentUser) ? '最高管理員' : (currentUser.role === 'admin' ? '系統管理員' : '一般使用者')})</span>
          </div>
          <div>SWTC Formlabs SLA 內部資安管制平台</div>
        </div>
      </div>

      {/* Universal In-Modal Action Confirmation Dialog */}
      {confirmDialog && (
        <div 
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => { if (!actionInProgress) setConfirmDialog(null); }}
        >
          <div 
            className="w-full max-w-md bg-gray-900 border border-gray-700/90 rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                confirmDialog.confirmTone === 'amber'
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : confirmDialog.confirmTone === 'red'
                    ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : confirmDialog.confirmTone === 'purple'
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                      : 'bg-blue-500/20 text-blue-400 border-blue-500/40'
              }`}>
                {confirmDialog.iconType === 'crown' && <Crown size={22} />}
                {confirmDialog.iconType === 'ban' && <Ban size={22} />}
                {confirmDialog.iconType === 'key' && <KeyRound size={22} />}
                {confirmDialog.iconType === 'user' && <Users size={22} />}
                {confirmDialog.iconType === 'trash' && <Trash2 size={22} />}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {confirmDialog.title}
                </h3>
                <p className="text-xs text-gray-300 mt-2 leading-relaxed whitespace-pre-wrap">
                  {confirmDialog.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-800">
              <button
                type="button"
                disabled={actionInProgress}
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={actionInProgress}
                onClick={async () => {
                  setActionInProgress(true);
                  try {
                    await confirmDialog.action();
                    setConfirmDialog(null);
                  } catch (err: any) {
                    showBanner('error', err?.message || '操作執行失敗');
                  } finally {
                    setActionInProgress(false);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-lg transition-all cursor-pointer disabled:opacity-50 ${
                  confirmDialog.confirmTone === 'amber'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                    : confirmDialog.confirmTone === 'red'
                      ? 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
                      : confirmDialog.confirmTone === 'purple'
                        ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30'
                        : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                }`}
              >
                {actionInProgress && <RefreshCw size={14} className="animate-spin" />}
                <span>{confirmDialog.confirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Direct Create User / Admin Modal */}
      {showNewUserModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div 
            className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${
                  newRole === 'admin' ? 'bg-amber-600/20 text-amber-400' : 'bg-blue-600/20 text-blue-400'
                }`}>
                  {newRole === 'admin' ? <Crown size={18} /> : <UserPlus size={18} />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {newRole === 'admin' ? '手動建立新管理員帳號' : '手動建立新工程師帳號'}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    {newRole === 'admin' 
                      ? '直接開立具有管理控制台權限之帳號' 
                      : '由管理員直接建檔，免填寫邀請碼'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNewUserModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {createUserError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{createUserError}</span>
              </div>
            )}

            <form onSubmit={handleDirectCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">使用者姓名 / 顯示名稱</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: 機構工程師 林志銘"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">電子郵件信箱 (Email) *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="engineer@company.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">預設登入密碼 * (至少 6 字元)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">指派系統權限</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="user">一般工程師 (User) - 可上傳模型、執行切片優化與導出專案</option>
                  <option value="admin">系統管理員 (Admin) - 具備增減管理員、帳號管理與序號發行全權</option>
                </select>
              </div>

              {newRole === 'user' && (
                <div className="space-y-1">
                  <DateDropdownPicker
                    value={newUserExpiryDate}
                    onChange={(newVal) => setNewUserExpiryDate(newVal)}
                    label="帳號使用期限 (到期日)"
                    subLabel="預設為 1 年有效"
                  />
                  <p className="text-[10px] text-gray-400">
                    到達該日期後帳號將無法登入，需填寫一次性授權邀請序號續期。管理員可隨時調整此期限。
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewUserModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className={`px-4 py-2 rounded-xl text-white font-medium shadow-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    newRole === 'admin'
                      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                  }`}
                >
                  {creatingUser ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>確認建立帳號</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Expiration Date Modal */}
      {editingExpiryUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div 
            className="w-full max-w-md bg-gray-900 border border-blue-500/40 rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    設定使用期限 (調整到期日)
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    管理員可隨時調整一般工程師帳號之最終到期日
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingExpiryUser(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Target user information summary */}
            <div className="p-3 bg-gray-800/60 border border-gray-700/70 rounded-xl space-y-1.5">
              <div className="text-xs font-semibold text-white flex items-center justify-between">
                <span>{editingExpiryUser.displayName || '未設定姓名'}</span>
                <span className="text-[10px] font-mono text-gray-400">
                  {editingExpiryUser.role === 'admin' ? '系統管理員' : '一般工程師'}
                </span>
              </div>
              <div className="text-[11px] text-gray-400 font-mono">
                {editingExpiryUser.email}
              </div>
              {(() => {
                const curExp = getAccountExpirationInfo(editingExpiryUser);
                return (
                  <div className="pt-1 border-t border-gray-700/60 flex items-center justify-between text-[11px]">
                    <span className="text-gray-400">目前有效期限:</span>
                    <span className={`font-mono font-medium ${
                      curExp.isExpired 
                        ? 'text-red-400' 
                        : curExp.isExpiringSoon 
                        ? 'text-amber-400' 
                        : 'text-emerald-400'
                    }`}>
                      {curExp.formattedDate} ({curExp.isExpired ? '已逾期停用' : `尚餘 ${curExp.daysRemaining} 天`})
                    </span>
                  </div>
                );
              })()}
            </div>

            {expiryError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{expiryError}</span>
              </div>
            )}

            <form onSubmit={handleSaveExpirationDate} className="space-y-4 text-xs">
              <DateDropdownPicker
                value={selectedExpiryDate}
                onChange={(newVal) => setSelectedExpiryDate(newVal)}
                label="選擇帳號最終使用日期 (到期日) *"
                subLabel="當日 23:59:59 到期"
              />

              {/* Quick Presets */}
              <div>
                <div className="text-[11px] text-gray-400 mb-1.5">快速延長使用期限：</div>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => applyExpiryPreset(3)}
                    className="px-2 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-[11px] transition-colors cursor-pointer text-center"
                  >
                    +3 個月
                  </button>
                  <button
                    type="button"
                    onClick={() => applyExpiryPreset(6)}
                    className="px-2 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-[11px] transition-colors cursor-pointer text-center"
                  >
                    +6 個月
                  </button>
                  <button
                    type="button"
                    onClick={() => applyExpiryPreset(12)}
                    className="px-2 py-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 hover:text-blue-200 border border-blue-800/60 text-[11px] font-semibold transition-colors cursor-pointer text-center"
                  >
                    +1 年 (預設)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyExpiryPreset(24)}
                    className="px-2 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-[11px] transition-colors cursor-pointer text-center"
                  >
                    +2 年
                  </button>
                </div>
              </div>

              {/* Policy note */}
              <div className="p-3 bg-blue-950/30 border border-blue-900/50 rounded-xl space-y-1 text-[11px] text-gray-300 leading-relaxed">
                <div className="font-semibold text-blue-300 flex items-center gap-1">
                  <ShieldCheck size={13} />
                  <span>使用期限管制說明</span>
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-gray-400 text-[10.5px]">
                  <li>到達該日期後，該帳號將無法登入系統，需填寫有效的一次性授權邀請序號完成驗證開通。</li>
                  <li>管理員在該帳號被停止前或停止後，均可在此隨時重新調整最終到期日。</li>
                  <li>透過授權邀請序號註冊的新帳號，預設均享有一年使用權限。</li>
                </ul>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-gray-800">
                <button
                  type="button"
                  disabled={savingExpiry}
                  onClick={() => setEditingExpiryUser(null)}
                  className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer text-xs"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingExpiry || !selectedExpiryDate}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-1.5 text-xs"
                >
                  {savingExpiry ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>{savingExpiry ? '儲存中...' : '儲存到期日設定'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
