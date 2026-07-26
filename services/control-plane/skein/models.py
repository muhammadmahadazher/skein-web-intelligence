from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class CrawlPolicyInput(BaseModel):
    max_depth: Annotated[int, Field(ge=0, le=32)] = 4
    max_pages: Annotated[int, Field(ge=1, le=10_000_000)] = 75
    max_body_bytes: Annotated[int, Field(ge=1_024, le=134_217_728)] = 16_777_216
    host_requests_per_second: Annotated[float, Field(ge=0.1, le=100)] = 2.0
    render_javascript: Literal["never", "adaptive", "always"] = "adaptive"
    obey_robots: bool = True


class CrawlCreate(BaseModel):
    seed_url: HttpUrl
    name: Annotated[str, Field(min_length=1, max_length=120)]
    policy: CrawlPolicyInput = Field(default_factory=CrawlPolicyInput)


class CrawlAccepted(BaseModel):
    id: UUID
    canonical_seed_url: str
    state: Literal["queued"]
    created_at: datetime
    status_url: str
    results_url: str


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    version: str
    checks: dict[str, str]
