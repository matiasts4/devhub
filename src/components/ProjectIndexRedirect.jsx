'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ProjectIndexRedirect() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => {
    if (params?.projectId) {
      router.replace(`/project/${params.projectId}/dashboard`);
    }
  }, [params?.projectId, router]);
  return null;
}
