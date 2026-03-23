import { Link } from "wouter";
import { ArrowLeft, AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 bg-secondary rounded-2xl mx-auto flex items-center justify-center text-muted-foreground mb-8">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">404</h1>
        <p className="text-lg text-muted-foreground">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <div className="pt-6">
          <Link href="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
