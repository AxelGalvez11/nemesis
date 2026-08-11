"""Nemesis layout adapter — APPEND to ParseBench's evaluation/layout_adapters/adapters.py.

It cannot live in the provider module: importing the adapter registry from a
provider is a circular import, which is why every built-in adapter — Docling's
included — lives in that one file.

Its whole job is a coordinate convention. Nemesis stores rectangles UNIT-RELATIVE
(0..1, top-left origin) because a rect is a crop request against a render whose
resolution is chosen at query time; ParseBench's layout predictions are absolute.
This multiplies. The Docling adapter makes the identical conversion.
"""

# When appended into ParseBench's adapters.py these names are already in
# scope; the import is here so this file is readable on its own.
from parse_bench.schemas.layout_detection_output import LayoutDetectionModel

def _content(item_type: str, text: str):
    if not text:
        return None
    if item_type == "Table":
        return LayoutTableContent(html=text)
    return LayoutTextContent(text=text)


@register_layout_adapter("nemesis_parse", priority=90)
class NemesisParseLayoutAdapter(LayoutAdapter):
    """Nemesis rectangles are UNIT-RELATIVE; layout predictions are absolute."""

    @classmethod
    def matches(cls, inference_result: InferenceResult) -> bool:
        if not isinstance(inference_result.output, ParseOutput):
            return False
        if not inference_result.output.layout_pages:
            return False
        raw = inference_result.raw_output
        # Gated on OUR marker so this adapter can never silently claim another
        # provider's output, which is how a coordinate convention gets applied to
        # numbers that are already in the other space.
        return isinstance(raw, dict) and "nemesis_source_file" in raw

    def to_layout_output(
        self,
        inference_result: InferenceResult,
        *,
        page_filter: int | None = None,
    ) -> LayoutOutput:
        # 🔴 THIS ADAPTER IS CALLED TWICE: once with the ParseOutput, and again
        # with the LayoutOutput it just produced, to filter to one page. Without
        # this branch the second call fails and every layout example is recorded
        # as an error — which is exactly what the --test subset caught.
        if isinstance(inference_result.output, LayoutOutput):
            if page_filter is None:
                return inference_result.output
            kept = [p for p in inference_result.output.predictions if p.page == page_filter]
            return inference_result.output.model_copy(update={"predictions": kept})

        if not isinstance(inference_result.output, ParseOutput):
            raise ValueError(
                f"NemesisParseLayoutAdapter requires ParseOutput or LayoutOutput, "
                f"got {type(inference_result.output).__name__}"
            )
        layout_pages = inference_result.output.layout_pages
        if not layout_pages:
            raise ValueError("NemesisParseLayoutAdapter requires non-empty layout_pages")

        predictions: list[LayoutPrediction] = []
        markdown_parts: list[str] = []
        # The page ParseBench treats as the reference frame for image_width/height.
        selected = [lp for lp in layout_pages if page_filter is None or lp.page_number == page_filter]
        reference = selected[0] if selected else layout_pages[0]

        for lp in layout_pages:
            if page_filter is not None and lp.page_number != page_filter:
                continue
            # A page whose size the format never stated cannot be scaled, and a
            # guessed page size would move every box on it. 1.0 leaves the
            # relative values in place rather than inventing a page.
            page_w = float(lp.width or 1.0)
            page_h = float(lp.height or 1.0)
            if lp.md:
                markdown_parts.append(lp.md)
            for item_idx, item in enumerate(lp.items):
                segments = item.layout_segments or ([item.bbox] if item.bbox is not None else [])
                for segment_idx, seg in enumerate(segments):
                    if seg is None:
                        continue
                    x1 = seg.x * page_w
                    y1 = seg.y * page_h
                    x2 = (seg.x + seg.w) * page_w
                    y2 = (seg.y + seg.h) * page_h
                    predictions.append(
                        LayoutPrediction(
                            bbox=[x1, y1, x2, y2],
                            score=float(seg.confidence or 1.0),
                            label=seg.label or item.type or "Text",
                            page=lp.page_number,
                            content=_content(item.type, item.value),
                            provider_metadata={
                                "order_index": len(predictions),
                                "item_index": item_idx,
                                "segment_index": segment_idx,
                            },
                        )
                    )

        return LayoutOutput(
            task_type="layout_detection",
            example_id=inference_result.request.example_id,
            pipeline_name=inference_result.pipeline_name,
            model=LayoutDetectionModel.NEMESIS_LAYOUT,
            # 🔴 THE PAGE'S OWN SIZE IN POINTS, NOT A RASTER SIZE. Nemesis rects
            # are relative to the page box `readPdfStructure` reports at scale 1,
            # so this is the frame the multiplication above is in. A render
            # resolution here would scale every box by the render factor.
            image_width=max(int(reference.width or 1), 1),
            image_height=max(int(reference.height or 1), 1),
            predictions=predictions,
            markdown="\n\n".join(markdown_parts),
        )
