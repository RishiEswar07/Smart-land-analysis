import asyncio
import sys
import traceback

sys.path.insert(0, r'd:\mini project\Smart-Land-Analysis-Platform\backend')

async def main():
    print("--- 1. Testing Database Connection ---")
    try:
        from app.db.session import engine
        from sqlalchemy import text

        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT current_database(), current_user;"))
            print("Connected DB & User:", res.fetchone())

            tables_res = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"))
            tables = [r[0] for r in tables_res.fetchall()]
            print("Public Tables:", tables)
    except Exception as e:
        print("DB ERROR:", e)
        traceback.print_exc()

    print("\n--- 2. Testing Password Hashing (passlib/bcrypt) ---")
    try:
        from app.core.security import hash_password, verify_password
        hashed = hash_password("testpassword123")
        valid = verify_password("testpassword123", hashed)
        print("Password Hash Test Result:", "PASSED" if valid else "FAILED")
    except Exception as e:
        print("SECURITY/HASH ERROR:", e)
        traceback.print_exc()

    print("\n--- 3. Testing User Creation / Lookup ---")
    try:
        from app.db.session import AsyncSessionLocal
        from app.services.auth_service import register_user, authenticate_user
        from app.schemas.auth import UserCreate

        async with AsyncSessionLocal() as db:
            user_in = UserCreate(
                email="diag_user@example.com",
                password="Password123!",
                full_name="Diag User"
            )
            try:
                user = await register_user(db, user_in)
                print("Registered user successfully:", user.id, user.email)
            except Exception as e:
                print("Registration info/error:", e)

            auth_user = await authenticate_user(db, "diag_user@example.com", "Password123!")
            print("Authentication result:", "SUCCESS" if auth_user else "FAILED")
    except Exception as e:
        print("AUTH SERVICE ERROR:", e)
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
