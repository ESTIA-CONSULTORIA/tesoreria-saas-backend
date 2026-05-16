const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('accessToken')
      : null;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
