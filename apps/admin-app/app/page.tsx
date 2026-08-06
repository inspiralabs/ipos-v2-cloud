'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

export default function Home() {
  const router = useRouter();
  const { accessToken, setAuth } = useAuthStore();

  useEffect(() => {
    if (accessToken) { router.replace('/licenses'); return; }
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => { if (!cancelled) { setAuth(data.access_token, data.user); router.replace('/licenses'); } })
      .catch(() => { if (!cancelled) router.replace('/login'); });
    return () => { cancelled = true; };
  }, [accessToken, router, setAuth]);

  return null;
}
