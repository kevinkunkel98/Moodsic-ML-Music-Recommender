from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from recommender import recommend

app = FastAPI()

# Dev CORS: allow the Vite dev server to call the API.
# Tighten this list for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/recommend")
def get_recommendation(query: str):
    results = recommend(query)
    return [
        {"title": song["title"], "score": float(score)}
        for song, score in results
    ]