import json
from pathlib import Path

from .models import MappingConfig

MAPPINGS_DIR = Path("mappings")


def list_mappings() -> list[dict]:
    """Lists all mapping templates saved in the mappings/ directory."""
    MAPPINGS_DIR.mkdir(exist_ok=True)
    mappings = []
    for f in MAPPINGS_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            cfg = MappingConfig.model_validate(data)
            mappings.append({
                "filename": f.name,
                "name": cfg.name,
                "version": cfg.version,
                "target_resource": cfg.target_resource,
                "status": cfg.status,
                "rule_count": len(cfg.rules),
                "rules": [r.model_dump() for r in cfg.rules],
                "constants": cfg.constants,
            })
        except Exception:
            continue
    return mappings


def load_mapping(filename: str) -> MappingConfig | None:
    """Loads a specific mapping configuration from mappings/."""
    if not filename.endswith(".json"):
        filename += ".json"
    p = MAPPINGS_DIR / filename
    if not p.exists():
        return None
    data = json.loads(p.read_text(encoding="utf-8"))
    return MappingConfig.model_validate(data)


def save_mapping(cfg: MappingConfig, filename: str | None = None) -> str:
    """Saves or updates a mapping configuration into mappings/."""
    MAPPINGS_DIR.mkdir(exist_ok=True)
    if not filename:
        clean_name = cfg.name.lower().replace(" ", "_").replace("-", "_")
        filename = f"{clean_name}.json"
    elif not filename.endswith(".json"):
        filename += ".json"
    p = MAPPINGS_DIR / filename
    p.write_text(json.dumps(cfg.model_dump(), indent=2), encoding="utf-8")
    return filename

