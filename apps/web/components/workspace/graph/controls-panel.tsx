// Graph controls panel. The 2D and 3D canvases are different renderers with
// different physics, so they get different panels (owner ask 2026-07-22) rather
// than one union with half the sliders greyed out.
//
// 2D follows Obsidian's graph settings — same grouping (Display / Forces) and
// the same names, so anyone who has used Obsidian already knows what each one
// does. 3D keeps the spatial controls, which have no Obsidian equivalent.

import { Button } from "@/components/desktop-ui/button";
import { Switch } from "@/components/desktop-ui/switch";

import {
  DEFAULT_CONTROLS,
  type GraphControlsState,
  MAX_LABEL_SIZE,
  MAX_LINK_THICKNESS,
  MAX_NODE_SIZE,
  MAX_TEXT_FADE,
  MIN_LABEL_SIZE,
  MIN_LINK_THICKNESS,
  MIN_NODE_SIZE,
} from "./graph-settings";

interface GraphControlsPanelProps {
  controls: GraphControlsState;
  onChange: (next: GraphControlsState) => void;
}

export function GraphControlsPanel({ controls, onChange }: GraphControlsPanelProps) {
  const is2D = controls.dimensions === 2;
  function set<K extends keyof GraphControlsState>(key: K, value: GraphControlsState[K]) {
    onChange({ ...controls, [key]: value });
  }

  return (
    <div className="w-64 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-4 text-(--ui-text-primary) shadow-lg">
      <div className="mb-4">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-(--ui-text-secondary)">Graph controls</p>
        <p className="mt-1 text-xs text-(--ui-text-secondary)">{is2D ? "Tune the flat map, its labels, and its forces." : "Tune the spatial force map and camera."}</p>
      </div>

      {is2D ? (
        <div className="space-y-4" data-testid="graph-controls-2d">
          <SectionLabel>Display</SectionLabel>
          <ControlSlider label="Node size" max={MAX_NODE_SIZE} min={MIN_NODE_SIZE} onChange={(v) => set("nodeSize", v)} step={0.1} value={controls.nodeSize} />
          <ControlSlider label="Link thickness" max={MAX_LINK_THICKNESS} min={MIN_LINK_THICKNESS} onChange={(v) => set("linkThickness", v)} step={0.1} value={controls.linkThickness} />
          <ControlSlider label="Text fade threshold" max={MAX_TEXT_FADE} min={0} onChange={(v) => set("textFadeThreshold", v)} step={0.1} value={controls.textFadeThreshold} />
          <ControlSlider label="Text size" max={MAX_LABEL_SIZE} min={MIN_LABEL_SIZE} onChange={(v) => set("labelSize", v)} step={0.1} value={controls.labelSize} />

          <SectionLabel className="pt-1">Forces</SectionLabel>
          <ControlSlider label="Center force" max={0.5} min={0} onChange={(v) => set("gravity", v)} step={0.02} value={controls.gravity} />
          <ControlSlider label="Repel force" max={140} min={0} onChange={(v) => set("repulsion", v)} step={5} value={controls.repulsion} />
          <ControlSlider label="Link force" max={1} min={0} onChange={(v) => set("linkForce", v)} step={0.05} value={controls.linkForce} />
          <ControlSlider label="Link distance" max={120} min={10} onChange={(v) => set("spread", v)} step={2} value={controls.spread} />
        </div>
      ) : (
        <div className="space-y-4" data-testid="graph-controls-3d">
          <ControlSlider label="Node size" max={MAX_NODE_SIZE} min={MIN_NODE_SIZE} onChange={(v) => set("nodeSize", v)} step={0.1} value={controls.nodeSize} />
          <ControlSlider label="Label size" max={MAX_LABEL_SIZE} min={MIN_LABEL_SIZE} onChange={(v) => set("labelSize", v)} step={0.1} value={controls.labelSize} />
          <ControlSlider label="Spread" max={120} min={10} onChange={(v) => set("spread", v)} step={2} value={controls.spread} />
          <ControlSlider label="Repulsion" max={140} min={0} onChange={(v) => set("repulsion", v)} step={5} value={controls.repulsion} />
          <ControlSlider label="Gravity" max={0.5} min={0} onChange={(v) => set("gravity", v)} step={0.02} value={controls.gravity} />
          <ControlSlider label="Rotation speed" max={3} min={0} onChange={(v) => set("rotationSpeed", v)} step={0.1} value={controls.rotationSpeed} />
        </div>
      )}

      <label className="mt-4 flex cursor-pointer items-center justify-between border-t border-(--ui-stroke-tertiary) pt-3 text-xs font-medium text-(--ui-text-primary)">
        Node names <Switch checked={controls.showNames} onCheckedChange={(v) => set("showNames", v)} size="xs" />
      </label>
      {is2D ? (
        <>
          <label className="mt-3 flex cursor-pointer items-center justify-between text-xs font-medium text-(--ui-text-primary)">
            Arrows <Switch checked={controls.showArrows} onCheckedChange={(v) => set("showArrows", v)} size="xs" />
          </label>
          <label className="mt-3 flex cursor-pointer items-center justify-between text-xs font-medium text-(--ui-text-primary)">
            Orphans <Switch checked={controls.showOrphans} onCheckedChange={(v) => set("showOrphans", v)} size="xs" />
          </label>
        </>
      ) : (
        <label className="mt-3 flex cursor-pointer items-center justify-between text-xs font-medium text-(--ui-text-primary)">
          Neighbor glow <Switch checked={controls.neighborGlow} onCheckedChange={(v) => set("neighborGlow", v)} size="xs" />
        </label>
      )}
      <Button
        className="mt-3"
        // Keep the dimension the user is looking at — resetting shouldn't also
        // throw them back into the other renderer.
        onClick={() => onChange({ ...DEFAULT_CONTROLS, dimensions: controls.dimensions })}
        size="inline"
        variant="text"
      >
        Reset to defaults
      </Button>
    </div>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[0.6rem] font-semibold uppercase tracking-[0.09em] text-(--ui-text-tertiary) ${className ?? ""}`}>
      {children}
    </p>
  );
}

interface ControlSliderProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}

function ControlSlider({ label, max, min, onChange, step, value }: ControlSliderProps) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between text-xs font-medium text-(--ui-text-primary)">
        {label}
        <span className="rounded bg-(--ui-bg-quaternary) px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-(--ui-text-secondary)">
          {value}
        </span>
      </span>
      <input
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-(--ui-stroke-primary) accent-foreground [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}
