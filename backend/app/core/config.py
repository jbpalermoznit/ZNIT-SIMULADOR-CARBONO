from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "sqlite:///./znit_carbon.db"
    JWT_SECRET: str = "change-me"
    JWT_EXPIRE_MINUTES: int = 60
    FRONTEND_URL: str = "http://localhost:3000"

    # Supabase externo — banco de fatores de emissão
    SUPABASE_URL: str = "https://xyuqhpgjbrattreuvfzy.supabase.co"
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SCHEMA: str = "backend"

    # Gemini via n8n webhook — agente IA
    N8N_WEBHOOK_URL: str = "https://orchestration.znit.ai/webhook/ocr-gemini"

    # API key para Power BI (acesso sem JWT)
    POWERBI_API_KEY: str = "znit-htb-powerbi-2026"


settings = Settings()
