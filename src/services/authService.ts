import { ADMIN_CONFIG, MOCK_AUTH_DELAY_MS } from '../config/adminConfig';

export interface LoginResult {
  success: boolean;
  errorMessage?: string;
}

/**
 * Mock authentication servisi.
 * Gerçek bir backend bağlanana kadar local kontrol yapar.
 * Bu fonksiyonun imzası (Promise<LoginResult>) gerçek bir API çağrısıyla
 * birebir değiştirilebilecek şekilde tasarlanmıştır.
 */
export async function loginAdmin(
  username: string,
  password: string,
): Promise<LoginResult> {
  await new Promise<void>(resolve => setTimeout(() => resolve(), MOCK_AUTH_DELAY_MS));

  if (!username.trim() || !password.trim()) {
    return { success: false, errorMessage: 'Kullanıcı adı ve şifre gerekli.' };
  }

  const isValid =
    username.trim() === ADMIN_CONFIG.username &&
    password === ADMIN_CONFIG.password;

  if (!isValid) {
    return { success: false, errorMessage: 'Kullanıcı adı veya şifre hatalı.' };
  }

  return { success: true };
}
