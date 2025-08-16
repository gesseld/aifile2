from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = Field(default="Auth Service")
    API_V1_STR: str = Field(default="/api/v1")

    # Database
    POSTGRES_SERVER: str = Field(default="postgres")
    POSTGRES_USER: str = Field(default="postgres")
    POSTGRES_PASSWORD: str = Field(default="postgres")
    POSTGRES_DB: str = Field(default="auth")
    SQLALCHEMY_DATABASE_URI: Optional[str] = Field(default=None)

    # Redis
    REDIS_URL: str = Field(default="redis://redis:6379")
    REDIS_PASSWORD: Optional[str] = Field(default=None)

    # JWT
    SECRET_KEY: str = Field(default="secret-key-change-in-production")
    REFRESH_SECRET_KEY: str = Field(default="refresh-secret-key-change-in-production")
    ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)

    # Admin
    FIRST_ADMIN_EMAIL: str = Field(default="admin@example.com")
    FIRST_ADMIN_PASSWORD: str = Field(default="changeme")

    # CORS
    CORS_ORIGINS: list[str] = Field(default=["*"])

    class Config:
        case_sensitive = True
        env_file = ".env"
        env_file_encoding = "utf-8"

    def __init__(self, **values):
        super().__init__(**values)
        self.SQLALCHEMY_DATABASE_URI = (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}/{self.POSTGRES_DB}"
        )


settings = Settings()
