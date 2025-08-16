from pydantic import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Subscription Service"
    SQLALCHEMY_DATABASE_URI: str = (
        "postgresql://user:password@postgres:5432/subscriptions"
    )
    REDIS_URL: str = "redis://redis:6379"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    EVENT_CHANNEL: str = "subscription.events"

    class Config:
        env_file = ".env"


settings = Settings()
