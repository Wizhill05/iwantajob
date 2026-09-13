FROM python:3.12-slim

WORKDIR /app

# Install runtime dependencies from pyproject constraints (project itself is
# not pip-installed; uvicorn runs src.main:app straight from the source tree)
RUN pip install --no-cache-dir \
    "fastapi>=0.110.0" \
    "uvicorn[standard]>=0.28.0" \
    "pydantic>=2.6.0" \
    "httpx>=0.27.0" \
    "curl-cffi>=0.6.2" \
    "beautifulsoup4>=4.12.0" \
    "sqlalchemy>=2.0.0" \
    "asyncpg>=0.29.0" \
    "mcp>=2.2.0" \
    python-dotenv

COPY src ./src

EXPOSE 8999

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8999"]
