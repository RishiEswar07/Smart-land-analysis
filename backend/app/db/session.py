import ssl
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool, QueuePool
from app.core.config import settings

database_url = settings.get_database_url(async_driver=True)
is_pooler = "pooler.supabase.com" in database_url or "6543" in database_url

connect_args = {}
if is_pooler:
    # Disable prepared statement caching for Supabase transaction mode (port 6543)
    connect_args["statement_cache_size"] = 0
    connect_args["prepared_statement_cache_size"] = 0

if "localhost" not in database_url and "127.0.0.1" not in database_url:
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    connect_args["ssl"] = ssl_context

# Use NullPool for Supabase pooler to prevent double-pooling conflicts
pool_cls = NullPool if is_pooler else QueuePool

engine = create_async_engine(
    database_url,
    echo=settings.DEBUG,
    poolclass=pool_cls,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

async def get_db():
    async with SessionLocal() as session:
        yield session
