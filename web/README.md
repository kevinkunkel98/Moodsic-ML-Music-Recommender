# Moodsic Frontend

Simple Vite + React frontend to send parameters to the FastAPI `/recommend` endpoint.

Quick start

1. Install dependencies

```bash
cd web
npm install
```

2. Run dev server

```bash
npm run dev
```

3. Open http://localhost:5173 and enter a query. Backend must be running at `http://127.0.0.1:8000`.

Notes
- If you get CORS errors, enable CORS in your FastAPI app (example: use `fastapi.middleware.cors.CORSMiddleware`).
- This is a minimal UI inspired by shadcn design tokens; you can swap components for the official shadcn UI library.
