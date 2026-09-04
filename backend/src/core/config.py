import os
from pydantic import BaseModel, Field

class Settings(BaseModel):
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
