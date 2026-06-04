import Layout from "@/components/Layout";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <p className="text-5xl font-black text-muted-foreground/30">404</p>
        <h1 className="text-xl font-bold text-foreground mt-4">Page not found</h1>
        <p className="text-sm text-muted-foreground mt-2">This page doesn't exist.</p>
        <Link href="/">
          <button className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
            Go Home
          </button>
        </Link>
      </div>
    </Layout>
  );
}
