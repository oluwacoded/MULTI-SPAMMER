import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export function reportError(err: unknown) {
  console.error(err);
}
