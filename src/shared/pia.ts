import axios from 'axios';
import type { AxiosResponse } from 'axios';

/** Session issued by PIA (the Printo auth service). Tokens are PIA JWTs, not Typesense keys. */
export interface PiaSession {
  access: string;
  refresh: string;
  fullName: string;
  isOpsTeam: boolean;
  isStaff: boolean;
}

export interface PiaGoogleAccount {
  employee_id: string;
  full_name?: string;
}

export type PiaLoginResult =
  | { status: 'ok'; session: PiaSession }
  | { status: 'select'; accounts: PiaGoogleAccount[] }
  | { status: 'error'; message: string };

export interface PiaRoles {
  fullName: string;
  isOpsTeam: boolean;
  isStaff: boolean;
}

// Never send cookies: PIA allows any origin, which browsers reject for credentialed requests.
// validateStatus lets us read PIA's `{ detail }` error bodies instead of catching axios errors.
const client = axios.create({
  baseURL: import.meta.env.PIA_API_URL,
  headers: { 'Content-Type': 'application/json' },
  validateStatus: () => true,
});

const REFRESH_MARGIN_SECONDS = 24 * 60 * 60;

function errorMessage(data: any, fallback: string): string {
  return data?.error || data?.detail || fallback;
}

function toSession(data: any): PiaSession {
  return {
    access: data.access,
    refresh: data.refresh,
    fullName: data.full_name || '',
    isOpsTeam: data.is_ops_team === true,
    isStaff: data.is_staff === true,
  };
}

function toLoginResult(response: AxiosResponse): PiaLoginResult {
  const data = response.data;
  if (data?.access) {
    return { status: 'ok', session: toSession(data) };
  }
  if (data?.requires_selection) {
    if (Array.isArray(data.accounts) && data.accounts.length > 0) {
      return { status: 'select', accounts: data.accounts };
    }
    return {
      status: 'error',
      message: 'No PIA account is linked to this Google account. Use your employee ID instead.',
    };
  }
  if (data?.registration_status === 'PENDING_APPROVAL') {
    return { status: 'error', message: 'Your account is pending admin approval.' };
  }
  return { status: 'error', message: errorMessage(data, 'Sign-in failed. Please try again.') };
}

export async function piaLoginWithPassword(
  employeeId: string,
  password: string,
): Promise<PiaLoginResult> {
  const response = await client.post('/auth/', { email: employeeId, password });
  return toLoginResult(response);
}

export async function piaLoginWithGoogle(idToken: string): Promise<PiaLoginResult> {
  const response = await client.post('/auth/google/login/', { id_token: idToken });
  return toLoginResult(response);
}

export async function piaSelectGoogleAccount(
  idToken: string,
  employeeId: string,
  password: string,
): Promise<PiaLoginResult> {
  const response = await client.post('/auth/google/login/select/', {
    id_token: idToken,
    employee_id: employeeId,
    password,
  });
  return toLoginResult(response);
}

/** Roles for a token, or null when PIA rejects it. Throws when PIA cannot be reached. */
export async function piaVerify(access: string): Promise<PiaRoles | null> {
  const response = await client.post('/auth/token-verify/', { token: access });
  if (response.status === 401 || response.status === 403) return null;
  if (response.status !== 200) throw new Error(`PIA token check failed (${response.status})`);
  return {
    fullName: response.data.full_name || '',
    isOpsTeam: response.data.is_ops_team === true,
    isStaff: response.data.is_staff === true,
  };
}

/** A fresh access token, or null when the refresh token is rejected. */
export async function piaRefresh(refresh: string): Promise<string | null> {
  const response = await client.post('/auth/refresh-token/', { refresh });
  if (response.status === 401 || response.status === 403) return null;
  if (response.status !== 200 || !response.data?.access) {
    throw new Error(`PIA token refresh failed (${response.status})`);
  }
  return response.data.access;
}

/** True when the token is expired or expires within a day. Unreadable tokens count as expiring. */
export function piaTokenExpiresSoon(token: string): boolean {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = Number((JSON.parse(json) as { exp?: number }).exp);
    if (!exp) return true;
    return exp - Date.now() / 1000 < REFRESH_MARGIN_SECONDS;
  } catch {
    return true;
  }
}
