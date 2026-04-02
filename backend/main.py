from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from recommender import recommend

app = FastAPI(title="Moodsic-Sentimentizer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:80",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/recommend")
def get_recommendation(query: str, top_k: int = 5) -> list[dict]:
    """
    Returns top_k track recommendations for the given mood query.
    Query params: query (str), top_k (int, default 5).
    """
    return recommend(query, top_k=top_k)
