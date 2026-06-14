"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Deep research now runs INLINE in the Ask thread, and reports live in the Reports library. This
// route is retired: a saved-report deep link (?r=<id>) forwards to /app/reports/<id>; anything else
// goes to Ask. Kept as a redirect so old bookmarks / links don't 404.
function ResearchRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const r = params.get("r");
    router.replace(r ? `/app/reports/${r}` : "/app/ask");
  }, [params, router]);
  return null;
}

export default function ResearchRedirectRoute() {
  return (
    <Suspense fallback={null}>
      <ResearchRedirect />
    </Suspense>
  );
}
