# FarmConnect – Farm Management System (PRD)

## Overview
Mobile-first (Expo, iOS + Android) farm management platform with AI-powered insights.

## Tech
- Frontend: Expo Router (React Native), TypeScript, expo-image-picker, expo-web-browser, expo-secure-store
- Backend: FastAPI + MongoDB (motor)
- AI: Gemini 3.1 Pro Preview via `emergentintegrations` (Emergent Universal LLM key)
- Auth: JWT (email/password) + Emergent Google OAuth (unified `get_current_user`)

## Core Features
1. **Auth** – Email/password (JWT) + Google sign-in. Secure token storage (SecureStore mobile / localStorage web).
2. **Multiple Farms** – Users can create, list, and delete multiple farms.
3. **Produce** – Add, categorize (Grain/Vegetable/Fruit/Dairy/Other), track quantity + unit per farm.
4. **Sellers** – Manage a shared roster of buyers/sellers with contact & location.
5. **Sales** – Record each sale (produce × seller × quantity × rate → total revenue).
6. **Investments** – Categorized farm expenses (Seeds/Fertilizer/Labour/Equipment/Irrigation/Other).
7. **Dashboard** – Daily / weekly / monthly aggregations: revenue, investment, profit, avg rate, quantities, sales-by-category, investment-by-category.
8. **AI Assistant** – Chat with Gemini 3 Pro (context-injected with farm summary). Supports image upload for plant disease detection.
9. **Community (Farm Friends)** – Post text/images, like posts.
10. **Marketplace** – Mock listings across channels (AgriBazaar, FarmToCity, etc.), gated by mock subscription.

## Design
- Fresh agri-green modern minimal palette (brand `#2D6A4F` light / `#52B788` dark)
- Explicit light + dark mode toggle
- iOS-native clean cards, 1px borders, generous whitespace
- Bottom tabs: Dashboard / Farms / AI / Market

## Endpoints (prefix `/api`)
- `POST /auth/register`, `POST /auth/login`, `POST /auth/google/session`, `POST /auth/logout`, `GET /me`
- `POST|GET|DELETE /farms`, `DELETE /farms/{id}`
- `POST|GET|DELETE /produce`
- `POST|GET /sellers`
- `POST|GET /sales`
- `POST|GET /investments`
- `GET /dashboard?period=daily|weekly|monthly`
- `POST /assistant/chat`, `GET /assistant/history?session_id=`, `GET /assistant/sessions`
- `POST|GET /community/posts`, `POST /community/posts/{id}/like`
- `GET /market/listings`, `POST /market/subscribe`, `POST /market/unsubscribe`

## Data Models (Mongo collections)
users, user_sessions, farms, produce, sellers, sales, investments, chat_messages, posts.

## Notes
- Marketplace subscription is MOCKED (no real payment).
- Google auth via Emergent managed OAuth.
- AI reads farm context (farms, produce, recent sales/investments) automatically to give grounded answers.
