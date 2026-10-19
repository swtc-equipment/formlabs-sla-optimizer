import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  deleteDoc 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export interface ActiveSession {
  sessionId: string;
  loggedInAt: string;
  lastActiveAt: string;
  deviceLabel: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  status: 'active' | 'pending' | 'disabled';
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  loginCount?: number;
  authProvider?: 'google' | 'email';
  expiresAt?: string; // Account validity expiration timestamp (ISO 8601)
  activeSession?: ActiveSession | null;
}

export interface InviteCode {
  id: string;
  code: string;
  status: 'active' | 'used' | 'revoked';
  createdBy: string;
  createdAt: string;
  usedByEmail?: string;
  usedAt?: string;
  note?: string;
}

export interface SavedProject {
  id: string;
  userId: string;
  fileName: string;
  fileSize?: number;
  stats?: any;
  weights?: any;
  rotation?: { x: number; y: number; z: number };
  score?: number;
  notes?: string;
  createdAt: string;
}

const STORAGE_SESSION_KEY = 'swtc_sla_current_user_v1';
const DEVICE_SESSION_KEY = 'swtc_sla_device_session_id_v1';
export const OWNER_EMAIL = 'karta1685232@gmail.com';
export const SESSION_HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds heartbeat
export const SESSION_INACTIVITY_TIMEOUT_MS = 150000; // 2.5 minutes without heartbeat => consider unlocked

// Get or generate a stable local session ID for this browser
export function getOrCreateLocalSessionId(): string {
  try {
    let sid = localStorage.getItem(DEVICE_SESSION_KEY);
    if (!sid) {
      sid = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem(DEVICE_SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
}

// Generate human-friendly label for current device/browser
export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return '電腦裝置';
  const ua = navigator.userAgent || '';
  let os = '電腦';
  if (/Win/i.test(ua)) os = 'Windows 電腦';
  else if (/Mac/i.test(ua)) os = 'Mac 電腦';
  else if (/Linux/i.test(ua)) os = 'Linux 電腦';
  else if (/iPad|iPhone|iPod/i.test(ua)) os = 'iOS 裝置';
  else if (/Android/i.test(ua)) os = 'Android 裝置';

  let browser = '瀏覽器';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  return `${os} (${browser})`;
}

// Check if an existing activeSession is still locked by another device
export function isSessionOccupiedByAnotherDevice(
  session: ActiveSession | null | undefined,
  currentLocalSessionId: string
): { isOccupied: boolean; occupiedSession?: ActiveSession } {
  if (!session || !session.sessionId) {
    return { isOccupied: false };
  }
  // Same machine/browser session
  if (session.sessionId === currentLocalSessionId) {
    return { isOccupied: false };
  }

  const lastActive = new Date(session.lastActiveAt || session.loggedInAt || 0).getTime();
  const now = Date.now();
  // Within active timeout window (2.5 mins)
  if (now - lastActive < SESSION_INACTIVITY_TIMEOUT_MS) {
    return { isOccupied: true, occupiedSession: session };
  }

  // Previous device disconnected or inactive over 2.5 minutes
  return { isOccupied: false };
}

// SHA-256 client-side irreversible password hashing with salt
export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password + '_swtc_sla_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailToDocId(email: string): string {
  return normalizeEmail(email).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Calculate default 1-year expiration timestamp (defaults to 1 year from base time, 23:59:59)
export function calculateDefaultExpiration(fromDate?: string | Date): string {
  const base = fromDate ? new Date(fromDate) : new Date();
  const d = isNaN(base.getTime()) ? new Date() : new Date(base);
  d.setFullYear(d.getFullYear() + 1);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * Calculate the renewed expiration date when applying a 1-year extension with an invite code.
 * 規則：
 * 1. 若該帳號尚未過期：以原本使用到期日再延長一年
 * 2. 若原本到期日已過期（或尚無有效到期日）：以使用當下的日期延長一年
 */
export function calculateRenewedExpiration(
  currentExpiresAt?: string,
  createdAt?: string,
  baseNow: Date = new Date()
): { newExpiresAt: string; wasExpired: boolean; previousExpiresAt?: string } {
  const nowTime = baseNow.getTime();
  let existingExpTime: number | null = null;
  let previousExpiresAt: string | undefined = undefined;

  if (currentExpiresAt) {
    const parsed = new Date(currentExpiresAt).getTime();
    if (!isNaN(parsed)) {
      existingExpTime = parsed;
      previousExpiresAt = currentExpiresAt;
    }
  } else if (createdAt) {
    const createdParsed = new Date(createdAt).getTime();
    if (!isNaN(createdParsed)) {
      const defExp = new Date(createdParsed);
      defExp.setFullYear(defExp.getFullYear() + 1);
      defExp.setHours(23, 59, 59, 999);
      existingExpTime = defExp.getTime();
      previousExpiresAt = defExp.toISOString();
    }
  }

  // 判斷帳號當前是否「尚未過期」 (到期時間在未來且大於當前時間)
  if (existingExpTime !== null && existingExpTime > nowTime) {
    const d = new Date(existingExpTime);
    d.setFullYear(d.getFullYear() + 1);
    d.setHours(23, 59, 59, 999);
    return {
      newExpiresAt: d.toISOString(),
      wasExpired: false,
      previousExpiresAt
    };
  }

  // 若原本到期日已過期或無效：以使用當下的日期延長一年
  const d = new Date(baseNow);
  d.setFullYear(d.getFullYear() + 1);
  d.setHours(23, 59, 59, 999);
  return {
    newExpiresAt: d.toISOString(),
    wasExpired: true,
    previousExpiresAt
  };
}

// Check if account has exceeded its validity expiration date
export function isAccountExpired(profile: Partial<UserProfile> | null | undefined): boolean {
  if (!profile) return false;
  const cleanEmail = normalizeEmail(profile.email || '');
  // Super Admin Owner and any Admin role never expire
  if (cleanEmail === OWNER_EMAIL || profile.role === 'admin') {
    return false;
  }
  
  // If expiresAt is set, compare with current timestamp
  if (profile.expiresAt) {
    const expTime = new Date(profile.expiresAt).getTime();
    if (!isNaN(expTime)) {
      return Date.now() > expTime;
    }
  }

  // Fallback for legacy accounts without explicit expiresAt: default to 1 year from createdAt
  if (profile.createdAt) {
    const createdTime = new Date(profile.createdAt).getTime();
    if (!isNaN(createdTime)) {
      const defaultExpTime = new Date(createdTime);
      defaultExpTime.setFullYear(defaultExpTime.getFullYear() + 1);
      defaultExpTime.setHours(23, 59, 59, 999);
      return Date.now() > defaultExpTime.getTime();
    }
  }

  return false;
}

export interface ExpirationInfo {
  isPermanent: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean; // within 14 days
  daysRemaining: number;
  formattedDate: string; // YYYY/MM/DD
  dateInputValue: string; // YYYY-MM-DD for HTML input
  rawIso: string;
}

// Return human-friendly and component-ready expiration metrics
export function getAccountExpirationInfo(profile: Partial<UserProfile> | null | undefined): ExpirationInfo {
  if (!profile) {
    return {
      isPermanent: false,
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: 0,
      formattedDate: '-',
      dateInputValue: '',
      rawIso: ''
    };
  }

  const cleanEmail = normalizeEmail(profile.email || '');
  if (cleanEmail === OWNER_EMAIL || profile.role === 'admin') {
    return {
      isPermanent: true,
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: Infinity,
      formattedDate: '永久有效 (管理員)',
      dateInputValue: '',
      rawIso: ''
    };
  }

  let expDate: Date;
  if (profile.expiresAt) {
    const parsed = new Date(profile.expiresAt);
    expDate = isNaN(parsed.getTime()) ? new Date() : parsed;
  } else if (profile.createdAt) {
    const parsed = new Date(profile.createdAt);
    if (!isNaN(parsed.getTime())) {
      parsed.setFullYear(parsed.getFullYear() + 1);
      parsed.setHours(23, 59, 59, 999);
      expDate = parsed;
    } else {
      const now = new Date();
      now.setFullYear(now.getFullYear() + 1);
      now.setHours(23, 59, 59, 999);
      expDate = now;
    }
  } else {
    const now = new Date();
    now.setFullYear(now.getFullYear() + 1);
    now.setHours(23, 59, 59, 999);
    expDate = now;
  }

  const nowMs = Date.now();
  const diffMs = expDate.getTime() - nowMs;
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isExpired = diffMs <= 0;
  const isExpiringSoon = !isExpired && daysRemaining <= 14;

  const yyyy = expDate.getFullYear();
  const mm = String(expDate.getMonth() + 1).padStart(2, '0');
  const dd = String(expDate.getDate()).padStart(2, '0');

  return {
    isPermanent: false,
    isExpired,
    isExpiringSoon,
    daysRemaining: isExpired ? Math.abs(daysRemaining) : daysRemaining,
    formattedDate: `${yyyy}/${mm}/${dd}`,
    dateInputValue: `${yyyy}-${mm}-${dd}`,
    rawIso: expDate.toISOString()
  };
}

// Register with Email & Password (stored securely in Firestore)
export async function registerWithCustomEmail(
  email: string, 
  password: string, 
  displayName?: string,
  inviteCode?: string
): Promise<UserProfile> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('請輸入正確的電子郵件格式。');
  }
  if (!password || password.length < 6) {
    throw new Error('密碼長度至少需 6 個字元。');
  }

  const isOwner = cleanEmail === OWNER_EMAIL;
  let matchingInviteDocId: string | null = null;

  // If not super admin owner, strictly enforce one-time invitation code
  if (!isOwner) {
    const cleanCode = (inviteCode || '').trim().toUpperCase();
    if (!cleanCode) {
      throw new Error('本系統為內部管制系統，註冊必須輸入由管理員配發之「一次性註冊授權碼」。');
    }

    const inviteQuery = query(
      collection(db, 'inviteCodes'),
      where('code', '==', cleanCode)
    );
    const inviteSnap = await getDocs(inviteQuery);

    if (inviteSnap.empty) {
      throw new Error('該註冊授權碼不存在或輸入錯誤，請向系統管理員索取有效序號。');
    }

    const inviteData = inviteSnap.docs[0].data() as InviteCode;
    if (inviteData.status === 'used') {
      throw new Error(`此授權碼已被使用（使用者：${inviteData.usedByEmail || '已註冊'}），無法重複使用。`);
    }
    if (inviteData.status === 'revoked') {
      throw new Error('此授權碼已被系統管理員作廢，無法進行註冊。');
    }

    matchingInviteDocId = inviteSnap.docs[0].id;
  }

  const docId = emailToDocId(cleanEmail);
  const accountRef = doc(db, 'accounts', docId);
  const snap = await getDoc(accountRef);

  if (snap.exists()) {
    throw new Error('此電子郵件已被註冊，請直接點選「登入帳號」。');
  }

  const pwdHash = await hashPassword(password);
  const now = new Date().toISOString();
  const localSid = getOrCreateLocalSessionId();
  const sessionRecord: ActiveSession = {
    sessionId: localSid,
    loggedInAt: now,
    lastActiveAt: now,
    deviceLabel: getDeviceLabel()
  };

  const profile: UserProfile = {
    uid: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    email: cleanEmail,
    displayName: displayName?.trim() || cleanEmail.split('@')[0] || '工程師',
    role: isOwner ? 'admin' : 'user',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    loginCount: 1,
    authProvider: 'email',
    // 剛透過授權邀請序號註冊的帳號預設都是可以使用一年
    expiresAt: isOwner ? undefined : calculateDefaultExpiration(now),
    activeSession: sessionRecord
  };

  // Save account record with password hash
  await setDoc(accountRef, {
    ...profile,
    passwordHash: pwdHash
  });

  // Also sync to users collection
  await setDoc(doc(db, 'users', profile.uid), profile);

  // Mark invite code as used immediately
  if (matchingInviteDocId) {
    try {
      await updateDoc(doc(db, 'inviteCodes', matchingInviteDocId), {
        status: 'used',
        usedByEmail: cleanEmail,
        usedAt: now,
        note: '註冊開通有效期限 1 年'
      });
    } catch (e) {
      console.warn('Failed to mark invite code as used:', e);
    }
  }

  // Save session
  saveLocalSession(profile);
  return profile;
}

// Login with Email & Password
export async function loginWithCustomEmail(email: string, password: string): Promise<UserProfile> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) {
    throw new Error('請輸入電子郵件信箱。');
  }
  if (!password) {
    throw new Error('請輸入密碼。');
  }

  const docId = emailToDocId(cleanEmail);
  const accountRef = doc(db, 'accounts', docId);
  const snap = await getDoc(accountRef);

  if (!snap.exists()) {
    throw new Error('此電子郵件尚未註冊，請先切換至「快速註冊」。');
  }

  const data = snap.data();
  const pwdHash = await hashPassword(password);
  if (data.passwordHash !== pwdHash) {
    throw new Error('密碼不正確，請重新檢查。');
  }

  if (data.status === 'disabled') {
    throw new Error('該帳號目前已被系統管理員停用，請聯繫主管或管理員。');
  }

  const isOwner = cleanEmail === OWNER_EMAIL;
  const userRole: 'admin' | 'user' = isOwner ? 'admin' : (data.role || 'user');

  // Check expiration: 到達該日期後該帳號將無法登入需重新填一次性授權邀請序號
  if (!isOwner && userRole !== 'admin' && isAccountExpired(data)) {
    const expInfo = getAccountExpirationInfo(data);
    const expErr: any = new Error(`該帳號授權期限已於 ${expInfo.formattedDate} 到期。需重新填寫由管理員派發之「一次性授權邀請序號」續期開通，或由管理員調整到期日。`);
    expErr.code = 'ACCOUNT_EXPIRED';
    expErr.expiredEmail = cleanEmail;
    expErr.formattedDate = expInfo.formattedDate;
    throw expErr;
  }

  // Check single-device session locking (一個帳號一次只能登入一台電腦)
  if (!isOwner) {
    const existingSession = data.activeSession as ActiveSession | undefined;
    const localSid = getOrCreateLocalSessionId();
    const { isOccupied, occupiedSession } = isSessionOccupiedByAnotherDevice(existingSession, localSid);
    if (isOccupied && occupiedSession) {
      const occupiedTime = occupiedSession.loggedInAt
        ? new Date(occupiedSession.loggedInAt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
      const err: any = new Error(
        `此帳號目前已在另一台電腦（${occupiedSession.deviceLabel || '其他裝置'}）登入中！\n\n為防範帳號遭非授權共用，本系統一次僅允許一台電腦登入。請先在該電腦點擊「登出」後，再於此電腦登入。`
      );
      err.code = 'ACCOUNT_ALREADY_LOGGED_IN';
      err.deviceLabel = occupiedSession.deviceLabel || '其他電腦';
      err.loggedInAt = occupiedSession.loggedInAt;
      err.occupiedTime = occupiedTime;
      err.lastActiveAt = occupiedSession.lastActiveAt;
      throw err;
    }
  }

  const now = new Date().toISOString();
  const localSid = getOrCreateLocalSessionId();
  const sessionRecord: ActiveSession = {
    sessionId: localSid,
    loggedInAt: now,
    lastActiveAt: now,
    deviceLabel: getDeviceLabel()
  };

  const updatedProfile: UserProfile = {
    uid: data.uid,
    email: data.email,
    displayName: data.displayName || data.email.split('@')[0],
    role: userRole,
    status: data.status || 'active',
    createdAt: data.createdAt || now,
    updatedAt: now,
    lastLoginAt: now,
    loginCount: (data.loginCount || 0) + 1,
    authProvider: 'email',
    expiresAt: userRole === 'admin' ? undefined : (data.expiresAt || calculateDefaultExpiration(data.createdAt || now)),
    activeSession: sessionRecord
  };

  // Update last login and activeSession
  try {
    await updateDoc(accountRef, {
      lastLoginAt: now,
      loginCount: updatedProfile.loginCount,
      updatedAt: now,
      activeSession: sessionRecord
    });
    await setDoc(doc(db, 'users', updatedProfile.uid), updatedProfile);
  } catch (e) {
    console.warn('Update login stats failed:', e);
  }

  saveLocalSession(updatedProfile);
  return updatedProfile;
}

export interface PendingGoogleUser {
  uid: string;
  email: string;
  displayName: string;
}

export interface GoogleAuthResult {
  status: 'authenticated' | 'needs_invite' | 'expired_needs_renewal';
  profile?: UserProfile;
  pendingGoogleUser?: PendingGoogleUser;
}

// Complete Google registration with invite code
export async function completeGoogleRegistrationWithCode(
  uid: string,
  email: string,
  displayName: string,
  inviteCode: string
): Promise<UserProfile> {
  const cleanEmail = normalizeEmail(email);
  const cleanCode = (inviteCode || '').trim().toUpperCase();
  if (!cleanCode) {
    throw new Error('請輸入由管理員配發之「一次性註冊授權邀請碼」。');
  }

  const inviteQuery = query(
    collection(db, 'inviteCodes'),
    where('code', '==', cleanCode)
  );
  const inviteSnap = await getDocs(inviteQuery);

  if (inviteSnap.empty) {
    throw new Error('該註冊授權碼不存在或輸入錯誤，請向系統管理員索取有效序號。');
  }

  const inviteDoc = inviteSnap.docs[0];
  const inviteData = inviteDoc.data() as InviteCode;
  if (inviteData.status === 'used') {
    throw new Error(`此授權碼已被使用（使用者：${inviteData.usedByEmail || '已註冊'}），無法重複使用。`);
  }
  if (inviteData.status === 'revoked') {
    throw new Error('此授權碼已被系統管理員作廢，無法進行註冊。');
  }

  const isOwner = cleanEmail === OWNER_EMAIL;
  const now = new Date().toISOString();
  const localSid = getOrCreateLocalSessionId();
  const sessionRecord: ActiveSession = {
    sessionId: localSid,
    loggedInAt: now,
    lastActiveAt: now,
    deviceLabel: getDeviceLabel()
  };

  const profile: UserProfile = {
    uid,
    email: cleanEmail,
    displayName: displayName.trim() || cleanEmail.split('@')[0] || '工程師',
    role: isOwner ? 'admin' : 'user',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    loginCount: 1,
    authProvider: 'google',
    // 剛透過授權邀請序號註冊的帳號預設都是可以使用一年
    expiresAt: isOwner ? undefined : calculateDefaultExpiration(now),
    activeSession: sessionRecord
  };

  // Save to users collection
  await setDoc(doc(db, 'users', uid), profile);

  // Mark invite code as used immediately
  try {
    await updateDoc(doc(db, 'inviteCodes', inviteDoc.id), {
      status: 'used',
      usedByEmail: cleanEmail,
      usedAt: now,
      note: 'Google 帳號註冊開通有效期限 1 年'
    });
  } catch (e) {
    console.warn('Failed to update invite code status:', e);
  }

  saveLocalSession(profile);
  return profile;
}

// Google Sign In (Requires invite code for first-time registration, blocks if expired)
export async function loginWithGoogle(presetInviteCode?: string): Promise<GoogleAuthResult> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;
  const cleanEmail = normalizeEmail(user.email || '');
  const isOwner = cleanEmail === OWNER_EMAIL;
  const now = new Date().toISOString();

  const userDocRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userDocRef);

  // 1. Existing user in 'users'
  if (snap.exists()) {
    const data = snap.data() as UserProfile;
    if (data.status === 'disabled') {
      await fbSignOut(auth).catch(() => {});
      throw new Error('該帳號目前已被系統管理員停用，請聯繫主管。');
    }

    // Check expiration: 到達該日期後該帳號將無法登入需重新填一次性授權邀請序號
    if (!isOwner && data.role !== 'admin' && isAccountExpired(data)) {
      await fbSignOut(auth).catch(() => {});
      return {
        status: 'expired_needs_renewal',
        profile: data,
        pendingGoogleUser: {
          uid: user.uid,
          email: cleanEmail,
          displayName: user.displayName || data.displayName || cleanEmail.split('@')[0]
        }
      };
    }

    // Check single-device session locking (一個帳號一次只能登入一台電腦)
    if (!isOwner) {
      const existingSession = data.activeSession as ActiveSession | undefined;
      const localSid = getOrCreateLocalSessionId();
      const { isOccupied, occupiedSession } = isSessionOccupiedByAnotherDevice(existingSession, localSid);
      if (isOccupied && occupiedSession) {
        await fbSignOut(auth).catch(() => {});
        const occupiedTime = occupiedSession.loggedInAt
          ? new Date(occupiedSession.loggedInAt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '';
        const err: any = new Error(
          `此 Google 帳號目前已在另一台電腦（${occupiedSession.deviceLabel || '其他裝置'}）登入中！\n\n為防範帳號遭非授權共用，系統限制一次僅允許一台電腦登入。請先在該電腦點擊「登出」後，再於此電腦登入。`
        );
        err.code = 'ACCOUNT_ALREADY_LOGGED_IN';
        err.deviceLabel = occupiedSession.deviceLabel || '其他電腦';
        err.loggedInAt = occupiedSession.loggedInAt;
        err.occupiedTime = occupiedTime;
        err.lastActiveAt = occupiedSession.lastActiveAt;
        throw err;
      }
    }

    const localSid = getOrCreateLocalSessionId();
    const sessionRecord: ActiveSession = {
      sessionId: localSid,
      loggedInAt: now,
      lastActiveAt: now,
      deviceLabel: getDeviceLabel()
    };

    const userRole = data.role || (isOwner ? 'admin' : 'user');
    const profile: UserProfile = {
      ...data,
      displayName: user.displayName || data.displayName,
      role: userRole,
      lastLoginAt: now,
      loginCount: (data.loginCount || 0) + 1,
      updatedAt: now,
      expiresAt: userRole === 'admin' ? undefined : (data.expiresAt || calculateDefaultExpiration(data.createdAt || now)),
      activeSession: sessionRecord
    };
    await updateDoc(userDocRef, {
      displayName: profile.displayName,
      lastLoginAt: now,
      loginCount: profile.loginCount,
      updatedAt: now,
      activeSession: sessionRecord
    });
    saveLocalSession(profile);
    return { status: 'authenticated', profile };
  }

  // 2. Pre-created by admin in 'accounts'
  const accDocId = emailToDocId(cleanEmail);
  const accSnap = await getDoc(doc(db, 'accounts', accDocId));
  if (accSnap.exists()) {
    const data = accSnap.data() as UserProfile;
    if (data.status === 'disabled') {
      await fbSignOut(auth).catch(() => {});
      throw new Error('該帳號目前已被系統管理員停用，請聯繫主管。');
    }

    // Check expiration
    if (!isOwner && data.role !== 'admin' && isAccountExpired(data)) {
      await fbSignOut(auth).catch(() => {});
      return {
        status: 'expired_needs_renewal',
        profile: data,
        pendingGoogleUser: {
          uid: user.uid,
          email: cleanEmail,
          displayName: user.displayName || data.displayName || cleanEmail.split('@')[0]
        }
      };
    }

    // Check single-device session locking (一個帳號一次只能登入一台電腦)
    if (!isOwner) {
      const existingSession = data.activeSession as ActiveSession | undefined;
      const localSid = getOrCreateLocalSessionId();
      const { isOccupied, occupiedSession } = isSessionOccupiedByAnotherDevice(existingSession, localSid);
      if (isOccupied && occupiedSession) {
        await fbSignOut(auth).catch(() => {});
        const occupiedTime = occupiedSession.loggedInAt
          ? new Date(occupiedSession.loggedInAt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '';
        const err: any = new Error(
          `此 Google 帳號目前已在另一台電腦（${occupiedSession.deviceLabel || '其他裝置'}）登入中！\n\n為防範帳號遭非授權共用，系統限制一次僅允許一台電腦登入。請先在該電腦點擊「登出」後，再於此電腦登入。`
        );
        err.code = 'ACCOUNT_ALREADY_LOGGED_IN';
        err.deviceLabel = occupiedSession.deviceLabel || '其他電腦';
        err.loggedInAt = occupiedSession.loggedInAt;
        err.occupiedTime = occupiedTime;
        err.lastActiveAt = occupiedSession.lastActiveAt;
        throw err;
      }
    }

    const localSid = getOrCreateLocalSessionId();
    const sessionRecord: ActiveSession = {
      sessionId: localSid,
      loggedInAt: now,
      lastActiveAt: now,
      deviceLabel: getDeviceLabel()
    };

    const resolvedRole = data.role || (isOwner ? 'admin' : 'user');
    const profile: UserProfile = {
      uid: user.uid,
      email: cleanEmail,
      displayName: user.displayName || data.displayName,
      role: resolvedRole,
      status: 'active',
      createdAt: data.createdAt || now,
      updatedAt: now,
      lastLoginAt: now,
      loginCount: (data.loginCount || 0) + 1,
      authProvider: 'google',
      expiresAt: resolvedRole === 'admin' ? undefined : (data.expiresAt || calculateDefaultExpiration(data.createdAt || now)),
      activeSession: sessionRecord
    };
    await setDoc(userDocRef, profile);
    try {
      await updateDoc(doc(db, 'accounts', accDocId), { activeSession: sessionRecord, updatedAt: now });
    } catch {}
    saveLocalSession(profile);
    return { status: 'authenticated', profile };
  }

  // 3. Super Admin Owner bypasses invite code
  if (isOwner) {
    const localSid = getOrCreateLocalSessionId();
    const sessionRecord: ActiveSession = {
      sessionId: localSid,
      loggedInAt: now,
      lastActiveAt: now,
      deviceLabel: getDeviceLabel()
    };
    const profile: UserProfile = {
      uid: user.uid,
      email: cleanEmail,
      displayName: user.displayName || cleanEmail.split('@')[0],
      role: 'admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      loginCount: 1,
      authProvider: 'google',
      activeSession: sessionRecord
    };
    await setDoc(userDocRef, profile);
    saveLocalSession(profile);
    return { status: 'authenticated', profile };
  }

  // 4. NEW Google User -> Check if preset invite code provided
  const cleanCode = (presetInviteCode || '').trim().toUpperCase();
  if (cleanCode) {
    const profile = await completeGoogleRegistrationWithCode(
      user.uid,
      cleanEmail,
      user.displayName || cleanEmail.split('@')[0] || '工程師',
      cleanCode
    );
    return { status: 'authenticated', profile };
  }

  // Needs invite code!
  return {
    status: 'needs_invite',
    pendingGoogleUser: {
      uid: user.uid,
      email: cleanEmail,
      displayName: user.displayName || cleanEmail.split('@')[0] || '工程師'
    }
  };
}

// Release active single-machine session lock when user explicitly signs out
export async function releaseActiveSession(email: string, uid?: string): Promise<void> {
  const cleanEmail = normalizeEmail(email || '');
  if (!cleanEmail) return;
  const now = new Date().toISOString();
  try {
    const accDocId = emailToDocId(cleanEmail);
    await updateDoc(doc(db, 'accounts', accDocId), {
      activeSession: null,
      updatedAt: now
    }).catch(async () => {
      await setDoc(doc(db, 'accounts', accDocId), { activeSession: null, updatedAt: now }, { merge: true });
    });
  } catch {}

  if (uid) {
    try {
      await updateDoc(doc(db, 'users', uid), {
        activeSession: null,
        updatedAt: now
      }).catch(async () => {
        await setDoc(doc(db, 'users', uid), { activeSession: null, updatedAt: now }, { merge: true });
      });
    } catch {}
  }
}

// Send periodic heartbeat to keep lock alive. Returns false if session was superseded or cleared on another machine.
export async function sendSessionHeartbeat(email: string, uid?: string): Promise<boolean> {
  const cleanEmail = normalizeEmail(email || '');
  if (!cleanEmail) return true;
  const localSid = getOrCreateLocalSessionId();
  const now = new Date().toISOString();

  try {
    const accDocId = emailToDocId(cleanEmail);
    const accRef = doc(db, 'accounts', accDocId);
    const snap = await getDoc(accRef);

    if (snap.exists()) {
      const data = snap.data();
      const session = data?.activeSession as ActiveSession | null | undefined;
      // If session exists and has a different session ID, this client was superseded!
      if (session && session.sessionId && session.sessionId !== localSid) {
        return false;
      }
      // If session is explicitly null and account is not owner, session was forcefully released by admin/system
      if (session === null && cleanEmail !== OWNER_EMAIL) {
        return false;
      }
      
      await updateDoc(accRef, {
        'activeSession.lastActiveAt': now
      }).catch(async () => {
        await setDoc(accRef, {
          activeSession: {
            sessionId: localSid,
            loggedInAt: session?.loggedInAt || now,
            lastActiveAt: now,
            deviceLabel: session?.deviceLabel || getDeviceLabel()
          }
        }, { merge: true });
      });
    }

    if (uid) {
      const userRef = doc(db, 'users', uid);
      updateDoc(userRef, {
        'activeSession.lastActiveAt': now
      }).catch(() => {});
    }

    return true;
  } catch {
    return true; // Transient network error, do not disconnect user
  }
}

// Admin function to immediately force-release an account's active session lock
export async function forceReleaseUserSession(targetEmail: string, targetUid?: string): Promise<void> {
  const cleanEmail = normalizeEmail(targetEmail || '');
  if (!cleanEmail) return;
  const now = new Date().toISOString();

  try {
    const accDocId = emailToDocId(cleanEmail);
    await updateDoc(doc(db, 'accounts', accDocId), {
      activeSession: null,
      updatedAt: now
    }).catch(async () => {
      await setDoc(doc(db, 'accounts', accDocId), {
        activeSession: null,
        updatedAt: now
      }, { merge: true });
    });
  } catch (e) {
    console.warn('forceReleaseUserSession accounts error:', e);
  }

  if (targetUid) {
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        activeSession: null,
        updatedAt: now
      }).catch(async () => {
        await setDoc(doc(db, 'users', targetUid), {
          activeSession: null,
          updatedAt: now
        }, { merge: true });
      });
    } catch (e) {
      console.warn('forceReleaseUserSession users error:', e);
    }
  }
}

// Local session helpers
export function saveLocalSession(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
  } catch {}
}

export function getLocalSession(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearLocalSession(email?: string, uid?: string): Promise<void> {
  try {
    const current = getLocalSession();
    const targetEmail = email || current?.email;
    const targetUid = uid || current?.uid;
    if (targetEmail) {
      await releaseActiveSession(targetEmail, targetUid);
    }
    localStorage.removeItem(STORAGE_SESSION_KEY);
    await fbSignOut(auth).catch(() => {});
  } catch {}
}

// Fetch all registered users for Admin panel
export async function fetchAllUsers(): Promise<UserProfile[]> {
  try {
    const map = new Map<string, UserProfile>();

    // 1. Fetch from 'users'
    try {
      const snapUsers = await getDocs(collection(db, 'users'));
      snapUsers.forEach(d => {
        const u = d.data() as UserProfile;
        if (u.email) {
          const key = normalizeEmail(u.email);
          const isOwner = key === OWNER_EMAIL;
          const resolvedRole = isOwner ? 'admin' : (u.role || 'user');
          map.set(key, {
            ...u,
            displayName: isOwner ? '最高管理員' : (u.displayName || u.email.split('@')[0]),
            uid: u.uid || d.id,
            role: resolvedRole,
            status: u.status || 'active',
            expiresAt: resolvedRole === 'admin' 
              ? undefined 
              : (u.expiresAt || (u.createdAt ? calculateDefaultExpiration(u.createdAt) : calculateDefaultExpiration())),
            activeSession: u.activeSession || null
          });
        }
      });
    } catch (e) {
      console.warn('Fetch users error:', e);
    }

    // 2. Fetch from 'accounts'
    try {
      const snapAccounts = await getDocs(collection(db, 'accounts'));
      snapAccounts.forEach(d => {
        const data = d.data();
        if (data.email) {
          const key = normalizeEmail(data.email);
          const existing = map.get(key);
          const resolvedUid = existing?.uid || data.uid || d.id || emailToDocId(key);
          const isOwner = key === OWNER_EMAIL;
          const resolvedRole = isOwner ? 'admin' : (data.role || existing?.role || 'user');
          const resolvedExpiresAt = resolvedRole === 'admin'
            ? undefined
            : (data.expiresAt || existing?.expiresAt || (data.createdAt ? calculateDefaultExpiration(data.createdAt) : calculateDefaultExpiration()));

          map.set(key, {
            uid: resolvedUid,
            email: data.email,
            displayName: isOwner ? '最高管理員' : (data.displayName || existing?.displayName || data.email.split('@')[0]),
            role: resolvedRole,
            status: data.status || existing?.status || 'active',
            createdAt: data.createdAt || existing?.createdAt || '',
            updatedAt: data.updatedAt || existing?.updatedAt,
            lastLoginAt: data.lastLoginAt || existing?.lastLoginAt,
            loginCount: data.loginCount || existing?.loginCount || 1,
            authProvider: data.authProvider || existing?.authProvider || 'email',
            expiresAt: resolvedExpiresAt,
            activeSession: data.activeSession || existing?.activeSession || null
          });
        }
      });
    } catch (e) {
      console.warn('Fetch accounts error:', e);
    }

    const list = Array.from(map.values());
    return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return [];
  }
}

// Update user status, role, or expiration date (for Admin)
export async function updateUserRoleOrStatus(
  targetUid: string, 
  targetEmail: string,
  updates: Partial<Pick<UserProfile, 'role' | 'status' | 'expiresAt'>>
): Promise<void> {
  const cleanEmail = normalizeEmail(targetEmail || '');
  const now = new Date().toISOString();

  // Root Admin Owner protection
  if (cleanEmail === OWNER_EMAIL) {
    if (updates.role && updates.role !== 'admin') {
      throw new Error('系統最高擁有者 (Super Admin) 受安全機制保護，無法解除管理員權限。');
    }
    if (updates.status && updates.status === 'disabled') {
      throw new Error('系統最高擁有者 (Super Admin) 受安全機制保護，無法被停用。');
    }
  }

  // 1. Update in 'accounts' collection
  if (cleanEmail) {
    try {
      const docId = emailToDocId(cleanEmail);
      const accountRef = doc(db, 'accounts', docId);
      await setDoc(accountRef, {
        email: cleanEmail,
        ...updates,
        updatedAt: now
      }, { merge: true });
    } catch (e) {
      console.warn('Update in accounts failed:', e);
    }
  }

  // 2. Update in 'users' collection by targetUid
  if (targetUid) {
    try {
      const userDocRef = doc(db, 'users', targetUid);
      await setDoc(userDocRef, {
        ...updates,
        updatedAt: now
      }, { merge: true });
    } catch (e) {
      console.warn('Update in users by uid failed:', e);
    }
  }

  // 3. Update all docs matching cleanEmail in 'users'
  if (cleanEmail) {
    try {
      const usersQuery = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const snap = await getDocs(usersQuery);
      for (const d of snap.docs) {
        await setDoc(d.ref, {
          ...updates,
          updatedAt: now
        }, { merge: true });
      }
    } catch (e) {
      console.warn('Update in users by email failed:', e);
    }
  }

  // 4. Update local session cache if matching current session
  try {
    const local = getLocalSession();
    if (local && normalizeEmail(local.email) === cleanEmail) {
      saveLocalSession({
        ...local,
        ...updates,
        updatedAt: now
      });
    }
  } catch {}
}

// Admin adjusts user expiration date (can be adjusted anytime before or after account expiration)
export async function updateUserExpirationDate(
  targetUid: string,
  targetEmail: string,
  newExpirationDate: string // YYYY-MM-DD or ISO string
): Promise<string> {
  const cleanEmail = normalizeEmail(targetEmail);
  if (!cleanEmail) {
    throw new Error('未提供使用者 Email。');
  }
  if (cleanEmail === OWNER_EMAIL) {
    throw new Error('系統最高擁有者 (Super Admin) 具永久最高管理員權限，無需設定到期日。');
  }

  let isoExpiresAt: string;
  if (newExpirationDate.includes('T')) {
    const dateObj = new Date(newExpirationDate);
    if (isNaN(dateObj.getTime())) throw new Error('無效的日期格式。');
    isoExpiresAt = dateObj.toISOString();
  } else {
    // Format YYYY-MM-DD to end of day 23:59:59.999
    const parts = newExpirationDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      throw new Error('請選擇有效的到期年月日。');
    }
    const [y, m, d] = parts;
    const dateObj = new Date(y, m - 1, d, 23, 59, 59, 999);
    isoExpiresAt = dateObj.toISOString();
  }

  await updateUserRoleOrStatus(targetUid, cleanEmail, {
    expiresAt: isoExpiresAt
  });

  return isoExpiresAt;
}

// User renews expired account using a fresh one-time invite code (extends 1 year)
export async function renewAccountWithInviteCode(
  email: string,
  inviteCode: string,
  password?: string
): Promise<UserProfile> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) {
    throw new Error('請輸入欲續期開通之帳號 Email。');
  }

  const cleanCode = (inviteCode || '').trim().toUpperCase();
  if (!cleanCode) {
    throw new Error('請輸入由管理員配發之「一次性授權邀請序號」。');
  }

  // 1. Verify invitation code
  const inviteQuery = query(collection(db, 'inviteCodes'), where('code', '==', cleanCode));
  const inviteSnap = await getDocs(inviteQuery);

  if (inviteSnap.empty) {
    throw new Error('該授權邀請碼不存在或輸入錯誤，請向系統管理員索取。');
  }

  const inviteDoc = inviteSnap.docs[0];
  const inviteData = inviteDoc.data() as InviteCode;
  if (inviteData.status === 'used') {
    throw new Error(`此授權碼已被使用（使用者：${inviteData.usedByEmail || '已兌換'}），無法重複使用。`);
  }
  if (inviteData.status === 'revoked') {
    throw new Error('此授權碼已被系統管理員作廢，無法進行續期。');
  }

  // 2. Locate existing user in accounts or users
  const accDocId = emailToDocId(cleanEmail);
  const accSnap = await getDoc(doc(db, 'accounts', accDocId));

  let existingUser: UserProfile | null = null;
  let storedPasswordHash: string | undefined;

  if (accSnap.exists()) {
    const d = accSnap.data();
    storedPasswordHash = d.passwordHash;
    existingUser = d as UserProfile;
  } else {
    const uQuery = query(collection(db, 'users'), where('email', '==', cleanEmail));
    const uSnap = await getDocs(uQuery);
    if (!uSnap.empty) {
      existingUser = uSnap.docs[0].data() as UserProfile;
    }
  }

  if (!existingUser) {
    throw new Error('查無此帳號紀錄，請確認 Email 是否正確或點選「註冊帳號」。');
  }

  // If password provided and account has passwordHash, verify it
  if (password && storedPasswordHash) {
    const pwdHash = await hashPassword(password);
    if (pwdHash !== storedPasswordHash) {
      throw new Error('帳號密碼不正確，請重新檢查後再續期。');
    }
  }

  // 3. Renew expiration date:
  // 規則：若該帳號尚未過期就是原本使用到期日再延長一年，若原本到期日已過期則是使用當下的日期延長一年
  const now = new Date().toISOString();
  const rawCurrentExpiresAt = existingUser.expiresAt || (existingUser.createdAt ? calculateDefaultExpiration(existingUser.createdAt) : undefined);
  const { newExpiresAt, wasExpired, previousExpiresAt } = calculateRenewedExpiration(rawCurrentExpiresAt, existingUser.createdAt);

  const localSid = getOrCreateLocalSessionId();
  const sessionRecord: ActiveSession = {
    sessionId: localSid,
    loggedInAt: now,
    lastActiveAt: now,
    deviceLabel: getDeviceLabel()
  };

  const updatedProfile: UserProfile = {
    ...existingUser,
    role: existingUser.role || 'user',
    status: 'active', // unblock if previously marked
    expiresAt: newExpiresAt,
    updatedAt: now,
    lastLoginAt: now,
    loginCount: (existingUser.loginCount || 0) + 1,
    activeSession: sessionRecord
  };

  // 4. Update in accounts and users
  try {
    await setDoc(doc(db, 'accounts', accDocId), {
      ...updatedProfile,
      ...(storedPasswordHash ? { passwordHash: storedPasswordHash } : {})
    }, { merge: true });
  } catch (e) {
    console.warn('Update accounts on renew failed:', e);
  }

  if (updatedProfile.uid) {
    try {
      await setDoc(doc(db, 'users', updatedProfile.uid), updatedProfile, { merge: true });
    } catch (e) {
      console.warn('Update users on renew failed:', e);
    }
  }

  // 5. Consume invite code with descriptive record
  try {
    const prevDateStr = previousExpiresAt ? previousExpiresAt.slice(0, 10) : '';
    const newDateStr = newExpiresAt.slice(0, 10);
    const renewalLog = wasExpired
      ? `已過期續期：自當日延長 1 年至 ${newDateStr}`
      : `未到期提前續期：由原到期日 (${prevDateStr}) 順延 1 年至 ${newDateStr}`;

    await updateDoc(doc(db, 'inviteCodes', inviteDoc.id), {
      status: 'used',
      usedByEmail: cleanEmail,
      usedAt: now,
      note: (inviteData.note ? inviteData.note + ' • ' : '') + renewalLog
    });
  } catch (e) {
    console.warn('Failed to mark invite code as used:', e);
  }

  saveLocalSession(updatedProfile);
  return updatedProfile;
}

// Assign or revoke Admin role by Email directly
export async function assignAdminRoleByEmail(
  targetEmail: string, 
  role: 'admin' | 'user'
): Promise<void> {
  const cleanEmail = normalizeEmail(targetEmail);
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('請輸入有效的電子郵件地址。');
  }

  // Protect Owner
  if (cleanEmail === OWNER_EMAIL && role !== 'admin') {
    throw new Error('無法解除系統最高擁有者 (Super Admin) 的管理員權限。');
  }

  const now = new Date().toISOString();
  const docId = emailToDocId(cleanEmail);

  // 1. Update or create in 'accounts'
  const accountRef = doc(db, 'accounts', docId);
  try {
    await setDoc(accountRef, {
      email: cleanEmail,
      displayName: cleanEmail.split('@')[0],
      role,
      status: 'active',
      updatedAt: now,
      authProvider: cleanEmail.endsWith('@gmail.com') ? 'google' : 'email'
    }, { merge: true });
  } catch (e) {
    console.warn('Account update error in assignAdminRoleByEmail:', e);
  }

  // 2. Update any existing documents in 'users' matching this email
  try {
    const usersQuery = query(collection(db, 'users'), where('email', '==', cleanEmail));
    const usersSnap = await getDocs(usersQuery);
    if (!usersSnap.empty) {
      for (const d of usersSnap.docs) {
        await setDoc(d.ref, { role, updatedAt: now }, { merge: true });
      }
    }
  } catch (e) {
    console.warn('Users query error in assignAdminRoleByEmail:', e);
  }
}

// Safely load profile with accurate role from Firestore
export async function loadUserProfile(uid: string, email?: string): Promise<UserProfile | null> {
  const cleanEmail = normalizeEmail(email || '');
  const isOwner = cleanEmail === OWNER_EMAIL;
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        const resolvedRole = isOwner ? 'admin' : (data.role || 'user');
        return {
          ...data,
          displayName: isOwner ? '最高管理員' : (data.displayName || cleanEmail.split('@')[0]),
          role: resolvedRole,
          expiresAt: resolvedRole === 'admin' ? undefined : (data.expiresAt || (data.createdAt ? calculateDefaultExpiration(data.createdAt) : calculateDefaultExpiration())),
          activeSession: data.activeSession || null
        };
      }
    }
    if (cleanEmail) {
      const accSnap = await getDoc(doc(db, 'accounts', emailToDocId(cleanEmail)));
      if (accSnap.exists()) {
        const data = accSnap.data() as UserProfile;
        const resolvedRole = isOwner ? 'admin' : (data.role || 'user');
        return {
          ...data,
          displayName: isOwner ? '最高管理員' : (data.displayName || cleanEmail.split('@')[0]),
          role: resolvedRole,
          expiresAt: resolvedRole === 'admin' ? undefined : (data.expiresAt || (data.createdAt ? calculateDefaultExpiration(data.createdAt) : calculateDefaultExpiration())),
          activeSession: data.activeSession || null
        };
      }
    }
  } catch (e) {
    console.warn('loadUserProfile error:', e);
  }
  return null;
}

// Project saving
export async function saveOptimizationProject(
  userId: string, 
  data: Omit<SavedProject, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  const colRef = collection(db, 'projects');
  const docRef = await addDoc(colRef, {
    ...data,
    userId,
    createdAt: new Date().toISOString()
  });
  return docRef.id;
}

// Fetch user projects
export async function fetchUserProjects(userId: string): Promise<SavedProject[]> {
  try {
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    const list: SavedProject[] = [];
    snap.forEach(d => {
      list.push({ id: d.id, ...d.data() } as SavedProject);
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.error('Failed to fetch user projects:', err);
    return [];
  }
}

// Delete project
export async function deleteProject(projectId: string): Promise<void> {
  await deleteDoc(doc(db, 'projects', projectId));
}

// Generate new one-time registration invite code
export async function generateInviteCode(adminEmail: string, note?: string): Promise<InviteCode> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const code = `SWTC-${pick(4)}-${pick(4)}`;
  const now = new Date().toISOString();

  const codeData: Omit<InviteCode, 'id'> = {
    code,
    status: 'active',
    createdBy: adminEmail,
    createdAt: now,
    note: note?.trim() || ''
  };

  const docRef = await addDoc(collection(db, 'inviteCodes'), codeData);
  return {
    id: docRef.id,
    ...codeData
  };
}

// Fetch all invite codes
export async function fetchInviteCodes(): Promise<InviteCode[]> {
  try {
    const snap = await getDocs(collection(db, 'inviteCodes'));
    const list: InviteCode[] = [];
    snap.forEach(d => {
      list.push({ id: d.id, ...d.data() } as InviteCode);
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (e) {
    console.error('Failed to fetch invite codes:', e);
    return [];
  }
}

// Revoke an invite code
export async function revokeInviteCode(codeIdOrCode: string): Promise<void> {
  if (!codeIdOrCode) {
    throw new Error('未提供欲作廢的邀請碼識別。');
  }
  const now = new Date().toISOString();

  // 1. Try by direct doc ID
  try {
    const docRef = doc(db, 'inviteCodes', codeIdOrCode);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await setDoc(docRef, {
        status: 'revoked',
        revokedAt: now
      }, { merge: true });
      return;
    }
  } catch (e) {
    console.warn('Revoke by doc ID failed:', e);
  }

  // 2. Try by code string query (e.g. SWTC-XXXX-XXXX)
  try {
    const cleanCode = codeIdOrCode.trim().toUpperCase();
    const q = query(collection(db, 'inviteCodes'), where('code', '==', cleanCode));
    const snap = await getDocs(q);
    if (!snap.empty) {
      for (const d of snap.docs) {
        await setDoc(d.ref, {
          status: 'revoked',
          revokedAt: now
        }, { merge: true });
      }
      return;
    }
  } catch (e) {
    console.warn('Revoke by code string query failed:', e);
  }

  // 3. Fallback direct setDoc
  const fallbackRef = doc(db, 'inviteCodes', codeIdOrCode);
  await setDoc(fallbackRef, {
    status: 'revoked',
    revokedAt: now
  }, { merge: true });
}

// Delete an invite code permanently from database
export async function deleteInviteCode(codeIdOrCode: string): Promise<void> {
  if (!codeIdOrCode) return;
  
  // 1. Delete by direct doc ID
  try {
    const docRef = doc(db, 'inviteCodes', codeIdOrCode);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await deleteDoc(docRef);
      return;
    }
  } catch (e) {
    console.warn('Delete by doc ID failed:', e);
  }

  // 2. Try delete by matching code string query
  try {
    const cleanCode = codeIdOrCode.trim().toUpperCase();
    const q = query(collection(db, 'inviteCodes'), where('code', '==', cleanCode));
    const snap = await getDocs(q);
    if (!snap.empty) {
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
      return;
    }
  } catch (e) {
    console.warn('Delete by code query failed:', e);
  }

  // 3. Fallback direct deleteDoc
  await deleteDoc(doc(db, 'inviteCodes', codeIdOrCode));
}

// Batch delete invite codes
export async function deleteInviteCodes(codeIds: string[]): Promise<{ successCount: number; failCount: number }> {
  if (!codeIds || codeIds.length === 0) return { successCount: 0, failCount: 0 };
  let successCount = 0;
  let failCount = 0;

  await Promise.all(
    codeIds.map(async (id) => {
      try {
        await deleteInviteCode(id);
        successCount++;
      } catch (err) {
        console.warn(`Failed to delete invite code ${id}:`, err);
        failCount++;
      }
    })
  );

  return { successCount, failCount };
}

// Admin directly provisions a user account
export async function adminDirectCreateUser(
  email: string,
  password: string,
  displayName: string,
  role: 'admin' | 'user' = 'user',
  expiresAt?: string
): Promise<UserProfile> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('請輸入正確的電子郵件格式。');
  }
  if (!password || password.length < 6) {
    throw new Error('密碼長度至少需 6 個字元。');
  }

  const docId = emailToDocId(cleanEmail);
  const accountRef = doc(db, 'accounts', docId);
  const snap = await getDoc(accountRef);

  if (snap.exists()) {
    throw new Error('該電子郵件已存在，無法重複建立。');
  }

  const pwdHash = await hashPassword(password);
  const now = new Date().toISOString();
  const isOwner = cleanEmail === OWNER_EMAIL;
  const assignedRole = isOwner ? 'admin' : role;

  let finalExpiresAt: string | undefined = undefined;
  if (assignedRole !== 'admin') {
    if (expiresAt) {
      finalExpiresAt = expiresAt.includes('T') ? new Date(expiresAt).toISOString() : new Date(expiresAt + 'T23:59:59.999Z').toISOString();
    } else {
      finalExpiresAt = calculateDefaultExpiration(now);
    }
  }

  const profile: UserProfile = {
    uid: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    email: cleanEmail,
    displayName: displayName?.trim() || cleanEmail.split('@')[0],
    role: assignedRole,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    authProvider: 'email',
    expiresAt: finalExpiresAt
  };

  await setDoc(accountRef, {
    ...profile,
    passwordHash: pwdHash
  });

  await setDoc(doc(db, 'users', profile.uid), profile);
  return profile;
}
