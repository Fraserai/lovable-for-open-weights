"""The HTTP contract between the Next.js app and this bridge.

Field names are camelCase because they cross the wire to a TypeScript
client (see `app/api/training-runs/*` and `lib/providers/training-provider.ts`
on the Next.js side) — keeping them identical on both sides avoids a
translation layer that would only exist to rename things.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

Status = Literal["running", "complete", "error"]
Stage = Literal["preparing_data", "preparing_environment", "training", "finalizing"]


class DatasetPayload(BaseModel):
    fileName: str
    content: str


class CreateJobRequest(BaseModel):
    baseModelId: str
    instruction: str
    dataset: DatasetPayload


class JobResult(BaseModel):
    """A published model. `id` is the real Hugging Face repo id."""

    id: str
    url: str


class JobStatus(BaseModel):
    id: str
    status: Status
    stage: Stage
    progress: int
    message: Optional[str] = None
    result: Optional[JobResult] = None
    error: Optional[str] = None
    # True only when training already completed (and was already paid for)
    # and just the publish failed. The UI uses this to offer a free retry
    # instead of a button that would silently re-train and charge again.
    canRetryPublish: bool = False
