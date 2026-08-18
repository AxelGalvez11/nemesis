import { Suspense } from "react";

import { TutorLab } from "@/components/lab/tutor-lab";

export default function LabTutorPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-neutral-500">Opening…</p>}>
      <TutorLab />
    </Suspense>
  );
}
