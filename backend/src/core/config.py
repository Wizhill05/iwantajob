import os
from pathlib import Path
from pydantic import BaseModel, Field

# Automatically load from project root .env or backend/.env
try:
    from dotenv import load_dotenv
    root_env = Path(__file__).resolve().parents[3] / ".env"
    backend_env = Path(__file__).resolve().parents[2] / ".env"
    if root_env.exists():
        load_dotenv(dotenv_path=root_env)
    elif backend_env.exists():
        load_dotenv(dotenv_path=backend_env)
    else:
        load_dotenv()
except ImportError:
    pass

class Settings(BaseModel):
    database_url: str = Field(
        default=os.getenv(
            "DATABASE_URL",
            "postgresql+asyncpg://postgres:postgres@localhost:5432/iwantajob_db",
        )
    )
    freeapi_base_url: str = Field(
        default=os.getenv(
            "FREEAPI_BASE_URL",
            "https://freeapiforme.aryansingh.space/v1",
        )
    )
    freeapi_api_key: str = Field(
        default=os.getenv("FREEAPI_API_KEY", "")
    )
    freeapi_model: str = Field(
        default=os.getenv("FREEAPI_MODEL", "gemini-3.7-flash-tiered")
    )
    indeed_api_key: str = Field(
        default=os.getenv(
            "INDEED_API_KEY",
            "161092c2017b5bbab13edb12461a62d5a833871e7cad6d9d475304573de67ac8",
        )
    )
    indeed_app_version: str = Field(default=os.getenv("INDEED_APP_VERSION", "193.1"))
    indeed_ios_version: str = Field(default=os.getenv("INDEED_IOS_VERSION", "16.6.1"))
    indeed_locale: str = Field(default=os.getenv("INDEED_LOCALE", "en-IN"))
    indeed_co: str = Field(default=os.getenv("INDEED_CO", "IN"))
    min_request_interval_seconds: float = Field(
        default=float(os.getenv("INDEED_MIN_INTERVAL_SECONDS", "1.2"))
    )
    max_retries: int = Field(default=int(os.getenv("INDEED_MAX_RETRIES", "2")))
    timeout_seconds: float = Field(default=float(os.getenv("INDEED_TIMEOUT_SECONDS", "30.0")))
    http_proxy: str | None = Field(default=os.getenv("HTTP_PROXY"))

settings = Settings()
