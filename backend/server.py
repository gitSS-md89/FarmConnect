from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import re
import base64
import httpx
import bcrypt
import jwt as pyjwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---- Config ----
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_ALGO = 'HS256'
JWT_TTL_DAYS = 30

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title='FarmConnect API')
api_router = APIRouter(prefix="/api")

# ==================== Helpers ====================

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def uid(prefix: str = 'id') -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(days=JWT_TTL_DAYS),
        "iat": now_utc(),
        "type": "jwt",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='Not authenticated')
    token = authorization.split(' ', 1)[1].strip()
    # Try JWT first
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if user:
            return user
    except Exception:
        pass
    # Try Emergent session_token
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        exp = session.get('expires_at')
        if isinstance(exp, datetime):
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < now_utc():
                raise HTTPException(status_code=401, detail='Session expired')
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
        if user:
            return user
    raise HTTPException(status_code=401, detail='Invalid token')

# ==================== Models ====================

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class AuthOut(BaseModel):
    token: str
    user: dict

class GoogleSessionIn(BaseModel):
    session_id: str

class FarmIn(BaseModel):
    name: str
    location: Optional[str] = None
    size_acres: Optional[float] = None
    description: Optional[str] = None
    currency: Optional[str] = None       # override auto-detect
    default_unit: Optional[str] = None   # override auto-detect

class FarmUpdateIn(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    size_acres: Optional[float] = None
    description: Optional[str] = None
    currency: Optional[str] = None
    default_unit: Optional[str] = None

class UserSettingsIn(BaseModel):
    primary_currency: Optional[str] = None

class ProduceIn(BaseModel):
    farm_id: str
    name: str
    category: str  # e.g. Grain, Vegetable, Fruit, Dairy
    quantity: float
    unit: Optional[str] = None  # inherits farm.default_unit if None
    low_stock_threshold: Optional[float] = 0
    notes: Optional[str] = None

class SellerIn(BaseModel):
    name: str
    contact: Optional[str] = None
    location: Optional[str] = None
    currency: Optional[str] = None  # ISO 4217 code, e.g. USD, INR

class SellerCurrencyIn(BaseModel):
    currency: str

class SaleIn(BaseModel):
    farm_id: str
    produce_id: str
    seller_id: str
    quantity: float
    rate: float  # per unit
    notes: Optional[str] = None

class InvestmentIn(BaseModel):
    farm_id: str
    category: str  # Seeds, Fertilizer, Labour, Equipment, Irrigation, Other
    amount: float
    currency: Optional[str] = None  # defaults to farm's currency
    description: Optional[str] = None

class PostIn(BaseModel):
    content: str
    image_base64: Optional[str] = None

class ChatIn(BaseModel):
    session_id: Optional[str] = None
    message: str
    image_base64: Optional[str] = None  # base64 with or without data URL prefix

# ==================== Currency ====================

# ISO code → symbol
CURRENCY_SYMBOLS = {
    "USD": "$", "INR": "₹", "EUR": "€", "GBP": "£", "JPY": "¥",
    "CNY": "¥", "AUD": "A$", "CAD": "C$", "SGD": "S$", "AED": "AED ",
    "BRL": "R$", "ZAR": "R", "MXN": "MX$", "NGN": "₦", "KES": "KSh",
    "PKR": "₨", "BDT": "৳", "LKR": "Rs", "NPR": "₨", "IDR": "Rp",
    "MYR": "RM", "THB": "฿", "PHP": "₱", "VND": "₫", "CHF": "CHF ",
    "SEK": "kr", "NOK": "kr", "DKK": "kr", "PLN": "zł", "TRY": "₺",
    "RUB": "₽", "SAR": "SAR ", "EGP": "E£", "GHS": "GH₵",
}

# location keyword → currency
LOCATION_TO_CURRENCY = [
    (["india", "delhi", "mumbai", "bangalore", "bengaluru", "kolkata", "chennai", "hyderabad",
      "pune", "ahmedabad", "punjab", "haryana", "kerala", "karnataka", "maharashtra", "gujarat",
      "rajasthan", "uttar pradesh", "up", "bihar", "west bengal", "tamil nadu", "andhra"], "INR"),
    (["usa", "united states", "america", "us ", "u.s.", "new york", "california", "texas",
      "florida", "washington", "chicago", "boston", "seattle", "los angeles"], "USD"),
    (["uk", "united kingdom", "england", "britain", "london", "manchester", "scotland", "wales"], "GBP"),
    (["euro", "germany", "france", "spain", "italy", "netherlands", "belgium", "portugal",
      "ireland", "austria", "greece", "finland", "berlin", "paris", "madrid", "rome"], "EUR"),
    (["japan", "tokyo", "osaka"], "JPY"),
    (["china", "shanghai", "beijing", "shenzhen", "guangzhou"], "CNY"),
    (["australia", "sydney", "melbourne", "brisbane"], "AUD"),
    (["canada", "toronto", "vancouver", "montreal", "ottawa"], "CAD"),
    (["singapore"], "SGD"),
    (["uae", "dubai", "abu dhabi", "emirates"], "AED"),
    (["brazil", "sao paulo", "rio"], "BRL"),
    (["south africa", "johannesburg", "cape town"], "ZAR"),
    (["mexico", "mexico city"], "MXN"),
    (["nigeria", "lagos", "abuja"], "NGN"),
    (["kenya", "nairobi"], "KES"),
    (["pakistan", "karachi", "lahore", "islamabad"], "PKR"),
    (["bangladesh", "dhaka"], "BDT"),
    (["sri lanka", "colombo"], "LKR"),
    (["nepal", "kathmandu"], "NPR"),
    (["indonesia", "jakarta"], "IDR"),
    (["malaysia", "kuala lumpur"], "MYR"),
    (["thailand", "bangkok"], "THB"),
    (["philippines", "manila"], "PHP"),
    (["vietnam", "hanoi", "ho chi minh"], "VND"),
    (["switzerland", "zurich", "geneva"], "CHF"),
    (["sweden", "stockholm"], "SEK"),
    (["norway", "oslo"], "NOK"),
    (["denmark", "copenhagen"], "DKK"),
    (["poland", "warsaw"], "PLN"),
    (["turkey", "istanbul", "ankara"], "TRY"),
    (["russia", "moscow"], "RUB"),
    (["saudi", "riyadh", "jeddah"], "SAR"),
    (["egypt", "cairo"], "EGP"),
    (["ghana", "accra"], "GHS"),
]

def detect_currency(location: Optional[str]) -> Optional[str]:
    if not location:
        return None
    low = location.lower()
    for keywords, code in LOCATION_TO_CURRENCY:
        for kw in keywords:
            if kw in low:
                return code
    return None

# Approximate FX rates: base = USD. Rate = how many <CUR> per 1 USD.
FX_RATES_PER_USD = {
    "USD": 1.0, "INR": 83.0, "EUR": 0.92, "GBP": 0.78, "JPY": 150.0,
    "CNY": 7.2, "AUD": 1.53, "CAD": 1.35, "SGD": 1.34, "AED": 3.67,
    "BRL": 5.0, "ZAR": 18.5, "MXN": 17.0, "NGN": 1500.0, "KES": 130.0,
    "PKR": 280.0, "BDT": 110.0, "LKR": 300.0, "NPR": 133.0, "IDR": 15700.0,
    "MYR": 4.7, "THB": 35.0, "PHP": 56.0, "VND": 24500.0, "CHF": 0.88,
    "SEK": 10.5, "NOK": 10.7, "DKK": 6.85, "PLN": 4.0, "TRY": 32.0,
    "RUB": 90.0, "SAR": 3.75, "EGP": 48.0, "GHS": 12.0,
}

def convert_amount(amount: float, from_cur: Optional[str], to_cur: Optional[str]) -> float:
    if not amount:
        return 0.0
    f = (from_cur or "USD").upper()
    t = (to_cur or "USD").upper()
    if f == t:
        return round(amount, 2)
    fr = FX_RATES_PER_USD.get(f)
    tr = FX_RATES_PER_USD.get(t)
    if fr is None or tr is None:
        return round(amount, 2)
    usd = amount / fr
    return round(usd * tr, 2)

# Default units mapping. kg is nearly universal for agriculture.
UNIT_BY_CURRENCY = {
    "USD": "lb",   # US commonly uses pounds for produce retail
}
def detect_unit(location: Optional[str], currency: Optional[str]) -> str:
    # Prefer explicit US lb if in US; otherwise metric kg
    if currency and currency in UNIT_BY_CURRENCY:
        return UNIT_BY_CURRENCY[currency]
    return "kg"

@api_router.get('/currencies')
async def list_currencies():
    return [{"code": c, "symbol": s} for c, s in CURRENCY_SYMBOLS.items()]

@api_router.get('/fx/rates')
async def fx_rates():
    return {"base": "USD", "rates": FX_RATES_PER_USD, "note": "Approximate reference rates."}

# ==================== Startup ====================

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.farms.create_index([("owner_id", 1), ("farm_id", 1)])
    await db.produce.create_index("farm_id")
    await db.sales.create_index([("farm_id", 1), ("sold_at", -1)])
    await db.investments.create_index([("farm_id", 1), ("invested_at", -1)])

# ==================== Auth ====================

@api_router.post('/auth/register', response_model=AuthOut)
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, 'Email already registered')
    user_id = uid('u')
    doc = {
        "user_id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "password_hash": hash_password(body.password),
        "provider": "email",
        "picture": None,
        "primary_currency": "USD",
        "subscription": {"active": False, "plan": None, "renews_at": None},
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    token = make_jwt(user_id)
    user = {k: v for k, v in doc.items() if k not in ('password_hash', '_id')}
    return {"token": token, "user": user}

@api_router.post('/auth/login', response_model=AuthOut)
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not user.get('password_hash') or not verify_password(body.password, user['password_hash']):
        raise HTTPException(401, 'Invalid email or password')
    token = make_jwt(user['user_id'])
    user_out = {k: v for k, v in user.items() if k != 'password_hash'}
    return {"token": token, "user": user_out}

@api_router.post('/auth/google/session', response_model=AuthOut)
async def google_session(body: GoogleSessionIn):
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(
            'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data',
            headers={'X-Session-ID': body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(401, 'Invalid session')
    data = r.json()
    email = data.get('email', '').lower()
    name = data.get('name', 'User')
    picture = data.get('picture')
    session_token = data.get('session_token')
    if not email or not session_token:
        raise HTTPException(401, 'Invalid session data')
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing['user_id']
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = uid('u')
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "provider": "google",
            "password_hash": None,
            "primary_currency": "USD",
            "subscription": {"active": False, "plan": None, "renews_at": None},
            "created_at": now_utc(),
        })
    # Store session
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": now_utc() + timedelta(days=7),
        "created_at": now_utc(),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"token": session_token, "user": user}

@api_router.get('/me')
async def get_me(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    return user

@api_router.post('/auth/logout')
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith('bearer '):
        token = authorization.split(' ', 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}

@api_router.patch('/users/me/settings')
async def update_user_settings(body: UserSettingsIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    updates: dict = {}
    if body.primary_currency is not None:
        if body.primary_currency not in CURRENCY_SYMBOLS:
            raise HTTPException(400, 'Unsupported currency')
        updates['primary_currency'] = body.primary_currency
    if not updates:
        raise HTTPException(400, 'No changes provided')
    await db.users.update_one({"user_id": user['user_id']}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user['user_id']}, {"_id": 0, "password_hash": 0})
    return fresh

# ==================== Farms ====================

@api_router.post('/farms')
async def create_farm(body: FarmIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    farm_id = uid('f')
    currency = body.currency or detect_currency(body.location) or user.get('primary_currency', 'USD')
    default_unit = body.default_unit or detect_unit(body.location, currency)
    doc = {
        "farm_id": farm_id,
        "owner_id": user['user_id'],
        "name": body.name,
        "location": body.location,
        "size_acres": body.size_acres,
        "description": body.description,
        "currency": currency,
        "default_unit": default_unit,
        "created_at": now_utc(),
    }
    await db.farms.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api_router.patch('/farms/{farm_id}')
async def update_farm(farm_id: str, body: FarmUpdateIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    updates: dict = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if 'currency' in updates and updates['currency'] not in CURRENCY_SYMBOLS:
        raise HTTPException(400, 'Unsupported currency')
    if not updates:
        raise HTTPException(400, 'No changes provided')
    r = await db.farms.update_one(
        {"farm_id": farm_id, "owner_id": user['user_id']},
        {"$set": updates},
    )
    if r.matched_count == 0:
        raise HTTPException(404, 'Farm not found')
    return await db.farms.find_one({"farm_id": farm_id}, {"_id": 0})

@api_router.get('/farms')
async def list_farms(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    farms = await db.farms.find({"owner_id": user['user_id']}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return farms

@api_router.delete('/farms/{farm_id}')
async def delete_farm(farm_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    r = await db.farms.delete_one({"farm_id": farm_id, "owner_id": user['user_id']})
    if r.deleted_count == 0:
        raise HTTPException(404, 'Farm not found')
    await db.produce.delete_many({"farm_id": farm_id})
    await db.sales.delete_many({"farm_id": farm_id})
    await db.investments.delete_many({"farm_id": farm_id})
    return {"ok": True}

# ==================== Produce ====================

@api_router.post('/produce')
async def create_produce(body: ProduceIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    farm = await db.farms.find_one({"farm_id": body.farm_id, "owner_id": user['user_id']}, {"_id": 0})
    if not farm:
        raise HTTPException(404, 'Farm not found')
    unit = body.unit or farm.get('default_unit', 'kg')
    doc = {
        "produce_id": uid('p'),
        "farm_id": body.farm_id,
        "owner_id": user['user_id'],
        "name": body.name,
        "category": body.category,
        "quantity": body.quantity,
        "unit": unit,
        "low_stock_threshold": float(body.low_stock_threshold or 0),
        "notes": body.notes,
        "created_at": now_utc(),
    }
    await db.produce.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api_router.get('/produce')
async def list_produce(farm_id: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    q = {"owner_id": user['user_id']}
    if farm_id:
        q['farm_id'] = farm_id
    items = await db.produce.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.delete('/produce/{produce_id}')
async def delete_produce(produce_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    r = await db.produce.delete_one({"produce_id": produce_id, "owner_id": user['user_id']})
    if r.deleted_count == 0:
        raise HTTPException(404, 'Not found')
    return {"ok": True}

# ==================== Sellers ====================

@api_router.post('/sellers')
async def create_seller(body: SellerIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    currency = (body.currency or detect_currency(body.location))
    doc = {
        "seller_id": uid('s'),
        "owner_id": user['user_id'],
        "name": body.name,
        "contact": body.contact,
        "location": body.location,
        "currency": currency,
        "currency_detected": detect_currency(body.location),
        "created_at": now_utc(),
    }
    await db.sellers.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api_router.patch('/sellers/{seller_id}/currency')
async def set_seller_currency(seller_id: str, body: SellerCurrencyIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if body.currency not in CURRENCY_SYMBOLS:
        raise HTTPException(400, 'Unsupported currency')
    r = await db.sellers.update_one(
        {"seller_id": seller_id, "owner_id": user['user_id']},
        {"$set": {"currency": body.currency}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, 'Seller not found')
    seller = await db.sellers.find_one({"seller_id": seller_id}, {"_id": 0})
    return seller

@api_router.get('/sellers')
async def list_sellers(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    items = await db.sellers.find({"owner_id": user['user_id']}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

# ==================== Sales ====================

@api_router.post('/sales')
async def create_sale(body: SaleIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if body.quantity <= 0:
        raise HTTPException(400, 'Quantity must be positive')
    if body.rate <= 0:
        raise HTTPException(400, 'Rate must be positive')
    # Fetch produce for stock check + ownership
    prod = await db.produce.find_one(
        {"produce_id": body.produce_id, "owner_id": user['user_id'], "farm_id": body.farm_id},
        {"_id": 0},
    )
    if not prod:
        raise HTTPException(404, 'Produce not found for this farm')
    available = float(prod.get('quantity', 0) or 0)
    if body.quantity > available:
        raise HTTPException(400, f"Not enough stock. Available: {available} {prod.get('unit','')}, requested: {body.quantity}")
    # Fetch seller
    seller = await db.sellers.find_one(
        {"seller_id": body.seller_id, "owner_id": user['user_id']},
        {"_id": 0},
    )
    if not seller:
        raise HTTPException(404, 'Seller not found')
    if not seller.get('currency'):
        raise HTTPException(400, 'Seller currency not set. Set seller currency first.')
    currency = seller['currency']

    # Atomically decrement stock (guard against race)
    r = await db.produce.update_one(
        {"produce_id": body.produce_id, "quantity": {"$gte": body.quantity}},
        {"$inc": {"quantity": -body.quantity}},
    )
    if r.modified_count == 0:
        raise HTTPException(409, 'Stock changed. Please retry.')

    doc = {
        "sale_id": uid('sl'),
        "owner_id": user['user_id'],
        "farm_id": body.farm_id,
        "produce_id": body.produce_id,
        "produce_name": prod.get('name'),
        "produce_unit": prod.get('unit'),
        "seller_id": body.seller_id,
        "seller_name": seller.get('name'),
        "quantity": body.quantity,
        "rate": body.rate,
        "total": round(body.quantity * body.rate, 2),
        "currency": currency,
        "notes": body.notes,
        "sold_at": now_utc(),
    }
    await db.sales.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api_router.get('/sales')
async def list_sales(farm_id: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    q = {"owner_id": user['user_id']}
    if farm_id:
        q['farm_id'] = farm_id
    items = await db.sales.find(q, {"_id": 0}).sort("sold_at", -1).to_list(500)
    return items

# ==================== Investments ====================

@api_router.post('/investments')
async def create_investment(body: InvestmentIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    farm = await db.farms.find_one({"farm_id": body.farm_id, "owner_id": user['user_id']}, {"_id": 0})
    if not farm:
        raise HTTPException(404, 'Farm not found')
    currency = body.currency or farm.get('currency') or user.get('primary_currency', 'USD')
    if currency not in CURRENCY_SYMBOLS:
        raise HTTPException(400, 'Unsupported currency')
    doc = {
        "investment_id": uid('i'),
        "owner_id": user['user_id'],
        "farm_id": body.farm_id,
        "category": body.category,
        "amount": body.amount,
        "currency": currency,
        "description": body.description,
        "invested_at": now_utc(),
    }
    await db.investments.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api_router.get('/investments')
async def list_investments(farm_id: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    q = {"owner_id": user['user_id']}
    if farm_id:
        q['farm_id'] = farm_id
    items = await db.investments.find(q, {"_id": 0}).sort("invested_at", -1).to_list(500)
    return items

# ==================== Dashboard ====================

@api_router.get('/dashboard')
async def dashboard(period: Literal['daily', 'weekly', 'monthly'] = 'monthly',
                    authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    now = now_utc()
    if period == 'daily':
        start = now - timedelta(days=1)
    elif period == 'weekly':
        start = now - timedelta(days=7)
    else:
        start = now - timedelta(days=30)

    owner = user['user_id']
    target = user.get('primary_currency', 'USD')

    sales = await db.sales.find({"owner_id": owner, "sold_at": {"$gte": start}}, {"_id": 0}).to_list(1000)
    invests = await db.investments.find({"owner_id": owner, "invested_at": {"$gte": start}}, {"_id": 0}).to_list(1000)
    produce = await db.produce.find({"owner_id": owner}, {"_id": 0}).to_list(1000)

    # Convert to target
    total_revenue = sum(convert_amount(s.get('total', 0), s.get('currency', 'USD'), target) for s in sales)
    total_investment = sum(convert_amount(i.get('amount', 0), i.get('currency', 'USD'), target) for i in invests)
    profit = round(total_revenue - total_investment, 2)
    total_quantity_sold = sum(s.get('quantity', 0) for s in sales)
    total_quantity_stock = sum(p.get('quantity', 0) for p in produce)
    avg_rate = round(total_revenue / total_quantity_sold, 2) if total_quantity_sold > 0 else 0

    # By category (sales) — converted
    by_category: dict = {}
    for s in sales:
        prod = next((p for p in produce if p.get('produce_id') == s.get('produce_id')), None)
        cat = prod.get('category', 'Other') if prod else 'Other'
        conv = convert_amount(s.get('total', 0), s.get('currency', 'USD'), target)
        by_category[cat] = round(by_category.get(cat, 0) + conv, 2)

    # Investment by category — converted
    invest_by_cat: dict = {}
    for i in invests:
        c = i.get('category', 'Other')
        conv = convert_amount(i.get('amount', 0), i.get('currency', 'USD'), target)
        invest_by_cat[c] = round(invest_by_cat.get(c, 0) + conv, 2)

    # Native revenue by currency (unconverted, for reference)
    revenue_by_currency: dict = {}
    for s in sales:
        cur = s.get('currency') or 'USD'
        revenue_by_currency[cur] = round(revenue_by_currency.get(cur, 0) + s.get('total', 0), 2)

    # Low stock alerts
    low_stock = [
        {
            "produce_id": p.get('produce_id'),
            "name": p.get('name'),
            "quantity": p.get('quantity'),
            "unit": p.get('unit'),
            "threshold": p.get('low_stock_threshold', 0),
            "farm_id": p.get('farm_id'),
        }
        for p in produce
        if float(p.get('low_stock_threshold') or 0) > 0
        and float(p.get('quantity') or 0) <= float(p.get('low_stock_threshold') or 0)
    ]

    return {
        "period": period,
        "primary_currency": target,
        "primary_symbol": CURRENCY_SYMBOLS.get(target, '$'),
        "total_revenue": round(total_revenue, 2),
        "total_investment": round(total_investment, 2),
        "profit": profit,
        "total_quantity_sold": total_quantity_sold,
        "total_quantity_stock": total_quantity_stock,
        "avg_rate": avg_rate,
        "sales_by_category": by_category,
        "investment_by_category": invest_by_cat,
        "revenue_by_currency": revenue_by_currency,
        "low_stock_alerts": low_stock,
        "sales_count": len(sales),
        "produce_count": len(produce),
    }

# ==================== AI Assistant ====================

SYSTEM_PROMPT = (
    "You are Farm Hand AI — an expert agriculture assistant for smallholder and commercial farmers. "
    "You help with: crop planning, disease detection from photos, prevention & treatment tips, "
    "profit/investment analysis, market suggestions, product/input recommendations, and general "
    "farm-friend community advice. Be concise, actionable, and grounded. If a photo of a plant, leaf, "
    "produce, or soil is shared, identify likely issues (disease, pest, deficiency), confidence, "
    "prevention, and treatment. If farm data (revenue, investment, produce) is shared, analyze "
    "profitability and give clear next steps. Use short paragraphs and bullet lists."
)

def strip_data_url(b64: str) -> str:
    if b64.startswith('data:'):
        # data:image/jpeg;base64,XXXX
        parts = b64.split(',', 1)
        if len(parts) == 2:
            return parts[1]
    return b64

@api_router.post('/assistant/chat')
async def assistant_chat(body: ChatIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, 'AI key not configured')

    session_id = body.session_id or uid('chat')
    # Save user message
    await db.chat_messages.insert_one({
        "session_id": session_id,
        "user_id": user['user_id'],
        "role": "user",
        "content": body.message,
        "has_image": bool(body.image_base64),
        "created_at": now_utc(),
    })

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=SYSTEM_PROMPT,
        ).with_model("gemini", "gemini-3.1-pro-preview")

        # Prepare context: fetch quick farm summary
        farms = await db.farms.find({"owner_id": user['user_id']}, {"_id": 0}).to_list(20)
        produce = await db.produce.find({"owner_id": user['user_id']}, {"_id": 0}).to_list(50)
        recent_sales = await db.sales.find({"owner_id": user['user_id']}, {"_id": 0}).sort("sold_at", -1).to_list(10)
        recent_invest = await db.investments.find({"owner_id": user['user_id']}, {"_id": 0}).sort("invested_at", -1).to_list(10)

        context = (
            f"[Farmer: {user.get('name','')}]"
            f"\nFarms ({len(farms)}): " + ", ".join(f.get('name','?') for f in farms) +
            f"\nProduce items: {len(produce)}. Categories: " +
            ", ".join(sorted({p.get('category','?') for p in produce})) +
            f"\nRecent sales revenue: ${sum(s.get('total',0) for s in recent_sales):.2f}" +
            f"\nRecent investments: ${sum(i.get('amount',0) for i in recent_invest):.2f}"
        )
        full_message = context + "\n\nQ: " + body.message

        file_contents = None
        if body.image_base64:
            b64 = strip_data_url(body.image_base64)
            file_contents = [ImageContent(image_base64=b64)]

        msg = UserMessage(text=full_message, file_contents=file_contents) if file_contents else UserMessage(text=full_message)

        # Single retry for transient LLM errors
        reply_text = None
        last_err = None
        for _attempt in range(2):
            try:
                reply = await chat.send_message(msg)
                reply_text = str(reply)
                break
            except Exception as inner:
                last_err = inner
        if reply_text is None:
            raise last_err if last_err else RuntimeError('LLM failed')
    except Exception as e:
        logging.exception('assistant error')
        raise HTTPException(500, f'AI error: {str(e)[:200]}')

    await db.chat_messages.insert_one({
        "session_id": session_id,
        "user_id": user['user_id'],
        "role": "assistant",
        "content": reply_text,
        "has_image": False,
        "created_at": now_utc(),
    })

    return {"session_id": session_id, "reply": reply_text}

@api_router.get('/assistant/history')
async def assistant_history(session_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    msgs = await db.chat_messages.find(
        {"session_id": session_id, "user_id": user['user_id']}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return msgs

@api_router.get('/assistant/sessions')
async def assistant_sessions(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    pipeline = [
        {"$match": {"user_id": user['user_id']}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$session_id",
            "last": {"$first": "$content"},
            "last_at": {"$first": "$created_at"},
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 30},
    ]
    out = []
    async for row in db.chat_messages.aggregate(pipeline):
        out.append({"session_id": row["_id"], "last": row.get("last", "")[:120], "last_at": row.get("last_at")})
    return out

# ==================== Community ====================

@api_router.post('/community/posts')
async def create_post(body: PostIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = {
        "post_id": uid('po'),
        "user_id": user['user_id'],
        "user_name": user.get('name', 'Farmer'),
        "user_picture": user.get('picture'),
        "content": body.content,
        "image_base64": body.image_base64,
        "likes": 0,
        "created_at": now_utc(),
    }
    await db.posts.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api_router.get('/community/posts')
async def list_posts(authorization: Optional[str] = Header(None)):
    await get_current_user(authorization)
    posts = await db.posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return posts

@api_router.post('/community/posts/{post_id}/like')
async def like_post(post_id: str, authorization: Optional[str] = Header(None)):
    await get_current_user(authorization)
    await db.posts.update_one({"post_id": post_id}, {"$inc": {"likes": 1}})
    return {"ok": True}

# ==================== Marketplace (Mock) ====================

MARKET_LISTINGS = [
    {"id": "m1", "name": "AgriBazaar", "category": "Wholesale", "reach": "Nation-wide", "commission": "3%", "image": "https://images.pexels.com/photos/5425794/pexels-photo-5425794.jpeg"},
    {"id": "m2", "name": "FarmToCity", "category": "Direct-to-consumer", "reach": "Metro", "commission": "8%", "image": "https://images.unsplash.com/photo-1494187570835-b188e7f0f26e"},
    {"id": "m3", "name": "GreenGrocer Co-op", "category": "Local", "reach": "Regional", "commission": "5%", "image": "https://images.pexels.com/photos/5425794/pexels-photo-5425794.jpeg"},
    {"id": "m4", "name": "OrganicHub Export", "category": "Export", "reach": "International", "commission": "12%", "image": "https://images.unsplash.com/photo-1494187570835-b188e7f0f26e"},
]

@api_router.get('/market/listings')
async def market_listings(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    sub = user.get('subscription', {}) or {}
    return {"listings": MARKET_LISTINGS, "subscription": sub}

@api_router.post('/market/subscribe')
async def subscribe(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await db.users.update_one(
        {"user_id": user['user_id']},
        {"$set": {"subscription": {"active": True, "plan": "premium", "renews_at": (now_utc() + timedelta(days=30)).isoformat()}}}
    )
    return {"ok": True, "active": True}

@api_router.post('/market/unsubscribe')
async def unsubscribe(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await db.users.update_one(
        {"user_id": user['user_id']},
        {"$set": {"subscription": {"active": False, "plan": None, "renews_at": None}}}
    )
    return {"ok": True, "active": False}

# ==================== Root ====================

@api_router.get('/')
async def root():
    return {"service": "Farm Hand API", "ok": True}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
