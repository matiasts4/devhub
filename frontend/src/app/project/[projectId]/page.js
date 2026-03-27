'use client';
import { useParams, redirect } from 'next/navigation';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProjectIndexPage() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/project/${params.projectId}/dashboard`);
  }, [params.projectId, router]);
  return null;
}
