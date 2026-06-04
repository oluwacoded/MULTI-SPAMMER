import { useEffect } from "react";
import { useLocation } from "wouter";
import { Terminal } from "lucide-react";

export default function NotFound() {
  const [location] = useLocation();

  useEffect(() => {
    // Only show terminal output in development or when explicitly requested
    console.log(`404: Route not found: ${location}`);
  }, [location]);

  return (
    <div className="h-[80vh] w-full flex flex-col items-center justify-center space-y-6">
      <div className="rounded-full bg-secondary/50 p-6 shadow-inner">
        <Terminal className="h-12 w-12 text-muted-foreground" />
      </div>
      
      <div className="text-center space-y-2 max-w-md">
        <h1 className="text-4xl font-bold tracking-tight">404 Not Found</h1>
        <p className="text-muted-foreground font-mono text-sm bg-secondary p-2 rounded inline-block mt-2">
          {location}
        </p>
        <p className="text-muted-foreground mt-4">
          The requested resource could not be located on this server.
        </p>
      </div>
    </div>
  );
}
