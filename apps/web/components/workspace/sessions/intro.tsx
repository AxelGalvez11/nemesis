"use client";

export function Intro() {
  return (
    <div
      className="pointer-events-none flex w-full min-w-0 flex-col items-center justify-center px-0.5 py-6 text-center text-muted-foreground sm:px-6 lg:px-8"
      data-slot="aui_intro"
    >
      <h1 className="m-0 text-center text-2xl font-medium tracking-[-0.025em] text-foreground">What should we work on?</h1>
    </div>
  );
}
