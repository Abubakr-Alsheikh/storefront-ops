import type { Metadata } from "next";
import { PageNotFound } from "@/components/shell/PageNotFound";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return <PageNotFound />;
}
