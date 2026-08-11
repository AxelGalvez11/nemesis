"""ParseBench provider + layout adapter for the Nemesis production parser.

INSTALL: `bench/parsebench/install.sh <parsebench-checkout>` does all of it.
This file becomes `src/parse_bench/inference/providers/parse/nemesis.py`.

The layout adapter lives in `nemesis_layout_adapter.py` and is APPENDED to
ParseBench's own `evaluation/layout_adapters/adapters.py` — importing the adapter
registry from a provider module is a circular import, which is exactly why every
built-in adapter (Docling's included) lives in that one file.

WHAT IS AND IS NOT ADAPTED
--------------------------
This file contains NO parsing and NO metrics. It shells out to the same
`parseDocument` entry point the upload route and the document worker use, and
renames the resulting `DocumentModel` into ParseBench's schema. The evaluator,
its metrics and its test cases are used exactly as shipped — nothing is forked,
nothing is reimplemented, no LLM judges anything here.

The one piece of real logic is `NemesisParseLayoutAdapter`, which exists because
every provider must declare its own coordinate convention. Nemesis stores
rectangles UNIT-RELATIVE (0..1, top-left origin) because a rect is a crop request
against a render whose resolution is chosen at query time. ParseBench's layout
predictions are absolute. The adapter multiplies. That is its entire job, and it
is modelled on the Docling adapter, which makes the identical conversion.
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from parse_bench.inference.providers.base import (
    Provider,
    ProviderConfigError,
    ProviderPermanentError,
)
from parse_bench.inference.providers.registry import register_provider
from parse_bench.schemas.parse_output import PageIR, ParseOutput
from parse_bench.schemas.pipeline import PipelineSpec
from parse_bench.schemas.pipeline_io import (
    InferenceRequest,
    InferenceResult,
    RawInferenceResult,
)
from parse_bench.schemas.product import ProductType

# The Node CLI that runs the production parser. Overridable via config so a
# checkout anywhere can be pointed at.
DEFAULT_WEB_DIR = os.environ.get("NEMESIS_WEB_DIR", "")
CLI = "scripts/parsebench-parse.mts"


@register_provider("nemesis_parse")
class NemesisParseProvider(Provider):
    """Nemesis canonical structural parser (native PDF text + vector rulings)."""

    def __init__(self, provider_name: str, base_config: dict[str, Any] | None = None):
        super().__init__(provider_name, base_config)
        self._web_dir = self.base_config.get("web_dir") or DEFAULT_WEB_DIR
        self._timeout = int(self.base_config.get("timeout", 600))

    def _run_cli(self, pdf_path: str) -> dict[str, Any]:
        web = Path(self._web_dir)
        if not web.is_dir() or not (web / CLI).exists():
            raise ProviderConfigError(
                f"Set NEMESIS_WEB_DIR (or config web_dir) to the apps/web directory; {web / CLI} not found"
            )
        try:
            proc = subprocess.run(
                ["npx", "tsx", CLI, str(Path(pdf_path).resolve())],
                capture_output=True,
                cwd=str(web),
                text=True,
                timeout=self._timeout,
            )
        except subprocess.TimeoutExpired as e:
            # A timeout is a parser failure, not an empty document.
            raise ProviderPermanentError(f"Nemesis parser timed out after {self._timeout}s") from e

        if not proc.stdout.strip():
            raise ProviderPermanentError(
                f"Nemesis parser produced no output (exit {proc.returncode}): {proc.stderr[-400:]}"
            )
        try:
            payload = json.loads(proc.stdout)
        except json.JSONDecodeError as e:
            raise ProviderPermanentError(f"Nemesis parser emitted non-JSON: {proc.stdout[:300]}") from e

        # 🔴 A CRASH IS RECORDED AS A FAILURE, NEVER AS AN EMPTY PARSE. Scoring a
        # crash as "extracted nothing" turns a broken parser into a merely bad one
        # and averages it away.
        if not payload.get("ok"):
            raise ProviderPermanentError(
                f"Nemesis parser failed ({payload.get('reason')}): {payload.get('detail', '')[:300]}"
            )
        return payload

    def run_inference(self, pipeline: PipelineSpec, request: InferenceRequest) -> RawInferenceResult:
        if request.product_type != ProductType.PARSE:
            raise ProviderPermanentError(f"nemesis_parse supports PARSE only, got {request.product_type}")

        pdf_path = Path(request.source_file_path)
        if not pdf_path.exists():
            raise ProviderPermanentError(f"file not found: {pdf_path}")
        if pdf_path.suffix.lower() != ".pdf":
            raise ProviderPermanentError(f"nemesis_parse supports .pdf only, got {pdf_path.suffix}")

        started_at = datetime.now()
        raw_output = self._run_cli(str(pdf_path))
        # Carried so a reader of the results can tell WHICH lane produced them.
        raw_output["nemesis_source_file"] = str(pdf_path)
        completed_at = datetime.now()

        return RawInferenceResult(
            request=request,
            pipeline=pipeline,
            pipeline_name=pipeline.pipeline_name,
            product_type=request.product_type,
            raw_output=raw_output,
            started_at=started_at,
            completed_at=completed_at,
            latency_in_ms=int((completed_at - started_at).total_seconds() * 1000),
        )

    def normalize(self, raw_result: RawInferenceResult) -> InferenceResult:
        raw = raw_result.raw_output
        pages = [
            PageIR(page_index=int(p["page_index"]), markdown=str(p.get("markdown", "")))
            for p in raw.get("pages", [])
        ]
        output = ParseOutput(
            task_type="parse",
            example_id=raw_result.request.example_id,
            pipeline_name=raw_result.pipeline_name,
            pages=pages,
            layout_pages=raw.get("layout_pages", []),
            markdown=str(raw.get("markdown", "")),
        )
        return InferenceResult(
            request=raw_result.request,
            pipeline_name=raw_result.pipeline_name,
            product_type=raw_result.product_type,
            raw_output=raw,
            output=output,
            started_at=raw_result.started_at,
            completed_at=raw_result.completed_at,
            latency_in_ms=raw_result.latency_in_ms,
        )


def register_nemesis_pipelines(register_fn) -> None:
    """Call from `inference/pipelines/parse.py`."""
    register_fn(
        PipelineSpec(
            pipeline_name="nemesis_parse",
            provider_name="nemesis_parse",
            product_type=ProductType.PARSE,
            config={"timeout": 600, "web_dir": DEFAULT_WEB_DIR},
        )
    )
