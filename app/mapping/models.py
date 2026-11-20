from typing import Any, Literal

from pydantic import BaseModel, Field


class Rule(BaseModel):
    source: str                      # e.g. "fname" or "contact.phones[0]"
    target: str                      # e.g. "name[0].given[0]"
    transform: str = "direct"        # direct | date | map | upper | lower | strip
    args: dict[str, Any] = Field(default_factory=dict)
    required: bool = False
    confidence: float | None = None  # set by the AI suggester, ignored by the executor
    rationale: str | None = None


class MappingConfig(BaseModel):
    name: str
    version: int = 1
    target_resource: str = "Patient"
    status: Literal["draft", "pending_review", "approved"] = "draft"
    constants: dict[str, Any] = Field(default_factory=dict)  # target path -> fixed value
    metadata: dict[str, Any] = Field(default_factory=dict)   # LLM metrics, tokens, cost, latency
    rules: list[Rule]
