// A wrong URL used to show Next's default 404, a white page in a dark product with no way back.

export default function NotFound() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-(--ui-bg-editor)">
      <div className="mx-auto w-full max-w-sm px-6 text-center">
        <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">There is nothing at this address.</p>
        <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">The link may be old, or the page may have moved.</p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <a className="rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)" href="/learn">Back to Nemesis</a>
        </div>
      </div>
    </main>
  );
}
