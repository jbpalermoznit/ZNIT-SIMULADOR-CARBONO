"use client";
import { useParams, redirect } from "next/navigation";

export default function ProjectRoot() {
  const { projectId } = useParams<{ projectId: string }>();
  redirect(`/projects/${projectId}/overview`);
}
