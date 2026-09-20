# Deployment checklist

## Backend

1. Create `backend/.env` from `backend/.env.example`.
2. Set `JWT_SECRET_KEY` to a long random value.
3. Set `GEMINI_API_KEY` or `GROQ_API_KEY`.
4. Set `FRONTEND_ORIGINS` to the deployed frontend URL, with comma-separated values only when needed.
5. Install dependencies with `pip install -r requirements.txt`.
6. Start the API with `uvicorn main:app --host 0.0.0.0 --port $PORT`.

The SQLite database is local to the backend filesystem. Use persistent storage for `backend/quiz.db`, or replace it with a managed database before scaling to multiple instances.

## Frontend

1. Create `frontend/.env` from `frontend/.env.example`.
2. Set `VITE_API_BASE_URL` to the deployed backend URL.
3. Install dependencies with `npm ci`.
4. Build with `npm run build`.
5. Serve the generated `dist` directory with a static hosting provider.

## Security

- Never commit `.env` files or API keys.
- Rotate any key that has appeared in logs, screenshots, or chat messages.
- Configure HTTPS at the hosting provider.
- Keep `FRONTEND_ORIGINS` restricted to trusted origins.
