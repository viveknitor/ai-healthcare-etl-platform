import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


@dataclass(frozen=True)
class Settings:
    hapi_base_url: str = os.getenv("HAPI_BASE_URL", "https://hapi.fhir.org/baseR4")
    medplum_base_url: str = os.getenv("MEDPLUM_BASE_URL", "http://localhost:8103")
    medplum_client_id: str = os.getenv("MEDPLUM_CLIENT_ID", "")
    medplum_client_secret: str = os.getenv("MEDPLUM_CLIENT_SECRET", "")
    gemini_api_key: str = (
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or os.getenv("ANTHROPIC_API_KEY", "")
    )
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

    @property
    def anthropic_api_key(self) -> str:
        return self.gemini_api_key

    @property
    def anthropic_model(self) -> str:
        return self.gemini_model


def get_settings() -> Settings:
    return Settings()
