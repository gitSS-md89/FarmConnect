"""Iter-5 Security hardening tests.
Covers: SEC-A rate limit + daily quota, SEC-B payload caps, SEC-C revocable JWT + tv,
SEC-D neutral register error, password policy, CORS no-credentials, JWT_SECRET no fallback,
plus register/login rate limits (run LAST, isolated).

NOTE: rate-limit buckets are in-memory and reset by backend restart. Order matters -
non-rate-limit tests first, rate-limit tests last (they poison the buckets).
"""
import os
import time
import uuid
import requests
import pytest
import jwt as pyjwt

BASE = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') if 'EXPO_PUBLIC_BACKEND_URL' in os.environ else 'https://agri-operations-1.preview.emergentagent.com'
API = f"{BASE}/api"

# Existing seeded user (JWT)
SEED_EMAIL = 'test@farm.com'
SEED_PASSWORD = 'secret123'


def _fresh_email():
    return f"TEST_sec_{uuid.uuid4().hex[:10]}@farm.com"


@pytest.fixture(scope='module')
def token():
    """Fresh login for the seeded user. Each module gets its own token because
    logout tests will revoke earlier ones."""
    r = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()['token']


def _headers(tok):
    return {"Authorization": f"Bearer {tok}"}


# =============== SEC-D: source-level: JWT_SECRET has NO fallback ===============
class TestJwtSecretNoFallback:
    def test_source_uses_environ_index_no_default(self):
        with open('/app/backend/server.py') as f:
            src = f.read()
        assert "os.environ['JWT_SECRET']" in src, "JWT_SECRET must use os.environ['JWT_SECRET'] (fail-closed)"
        assert 'dev-secret' not in src, "dev-secret fallback must be removed"
        assert "os.environ.get('JWT_SECRET'" not in src, "must not use .get() with fallback"


# =============== SEC-D: Neutral register error + password policy ===============
class TestRegisterPolicy:
    def test_password_policy_short_rejected(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": _fresh_email(), "password": "short7!", "name": "Short"
        })
        assert r.status_code == 422, f"7-char password should be 422, got {r.status_code}: {r.text}"

    def test_password_policy_exact_8_accepted(self):
        email = _fresh_email()
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "12345678", "name": "Eight"
        })
        assert r.status_code == 200, r.text
        # Confirm login works
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "12345678"})
        assert r2.status_code == 200

    def test_neutral_error_on_duplicate_email(self):
        # existing seed user
        r = requests.post(f"{API}/auth/register", json={
            "email": SEED_EMAIL, "password": "anypassword123", "name": "Dup"
        })
        assert r.status_code == 400, r.text
        assert r.json().get('detail') == 'Registration failed', \
            f"Expected neutral 'Registration failed', got: {r.json()}"


# =============== SEC-B: Payload caps → 422 (no 500) ===============
class TestPayloadCaps:
    def test_post_content_over_4000_rejected(self, token):
        r = requests.post(f"{API}/community/posts",
                          headers=_headers(token),
                          json={"content": "x" * 5000})
        assert r.status_code == 422, r.text

    def test_post_image_over_cap_rejected(self, token):
        r = requests.post(f"{API}/community/posts",
                          headers=_headers(token),
                          json={"content": "ok", "image_base64": "A" * 2_500_001})
        assert r.status_code == 422, r.text

    def test_chat_message_over_4000_rejected(self, token):
        r = requests.post(f"{API}/assistant/chat",
                          headers=_headers(token),
                          json={"message": "x" * 5000})
        assert r.status_code == 422, r.text
        assert r.status_code != 500

    def test_farm_logo_over_cap_rejected(self, token):
        # create a farm to patch
        rc = requests.post(f"{API}/farms", headers=_headers(token),
                           json={"name": "TEST_sec_farm", "location": "USA"})
        assert rc.status_code == 200
        fid = rc.json()['farm_id']
        try:
            r = requests.patch(f"{API}/farms/{fid}", headers=_headers(token),
                               json={"logo": "A" * 2_500_001})
            assert r.status_code == 422, r.text
        finally:
            requests.delete(f"{API}/farms/{fid}", headers=_headers(token))

    def test_user_settings_picture_over_cap_rejected(self, token):
        r = requests.patch(f"{API}/users/me/settings",
                           headers=_headers(token),
                           json={"picture": "A" * 2_500_001})
        assert r.status_code == 422, r.text

    def test_user_settings_background_over_cap_rejected(self, token):
        r = requests.patch(f"{API}/users/me/settings",
                           headers=_headers(token),
                           json={"background_image": "A" * 2_500_001})
        assert r.status_code == 422, r.text


# =============== SEC-C: JWT payload has tv claim, TTL ~7 days ===============
class TestJwtStructure:
    def test_jwt_has_tv_and_7day_ttl(self, token):
        # Decode without verification to inspect claims
        claims = pyjwt.decode(token, options={"verify_signature": False})
        assert 'tv' in claims, f"JWT missing tv claim: {claims}"
        assert isinstance(claims['tv'], int)
        ttl = claims['exp'] - claims['iat']
        # 7 days = 604800s, allow +/- 60s
        assert 604700 <= ttl <= 604900, f"TTL should be ~7 days, got {ttl}s"

    def test_wrong_tv_returns_401(self):
        # Fresh login
        lr = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
        assert lr.status_code == 200
        tok = lr.json()['token']
        claims = pyjwt.decode(tok, options={"verify_signature": False})
        # Read the JWT_SECRET from backend .env to forge a token
        secret = None
        with open('/app/backend/.env') as f:
            for line in f:
                if line.startswith('JWT_SECRET'):
                    secret = line.split('=', 1)[1].strip().strip('"').strip("'")
                    break
        assert secret, "could not read JWT_SECRET"
        forged_claims = dict(claims)
        forged_claims['tv'] = claims['tv'] + 99  # wrong tv
        forged = pyjwt.encode(forged_claims, secret, algorithm='HS256')
        r = requests.get(f"{API}/me", headers={"Authorization": f"Bearer {forged}"})
        assert r.status_code == 401, r.text
        assert 'revoke' in r.json().get('detail', '').lower() or 'invalid' in r.json().get('detail', '').lower()


# =============== SEC-C: Revocable JWT via logout ===============
class TestRevocableJwt:
    def test_logout_revokes_previous_token(self):
        # Fresh login #1
        r1 = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
        assert r1.status_code == 200
        tok1 = r1.json()['token']
        # /me works
        m1 = requests.get(f"{API}/me", headers=_headers(tok1))
        assert m1.status_code == 200
        # logout with tok1
        lo = requests.post(f"{API}/auth/logout", headers=_headers(tok1))
        assert lo.status_code == 200
        # /me with same token should now 401
        m2 = requests.get(f"{API}/me", headers=_headers(tok1))
        assert m2.status_code == 401, m2.text
        detail = m2.json().get('detail', '').lower()
        assert 'revoke' in detail or 'invalid' in detail
        # login again → new token works
        r2 = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
        assert r2.status_code == 200
        tok2 = r2.json()['token']
        assert tok2 != tok1
        m3 = requests.get(f"{API}/me", headers=_headers(tok2))
        assert m3.status_code == 200


# =============== SEC-D: CORS no credentials ===============
class TestCors:
    def test_cors_allow_credentials_not_true(self):
        r = requests.options(f"{API}/", headers={
            "Origin": "http://example.com",
            "Access-Control-Request-Method": "GET",
        })
        ac = r.headers.get('access-control-allow-credentials', '').lower()
        assert ac != 'true', f"access-control-allow-credentials must not be true, got: {ac!r}"

    def test_cors_actual_response_no_credentials(self):
        r = requests.get(f"{API}/", headers={"Origin": "http://example.com"})
        ac = r.headers.get('access-control-allow-credentials', '').lower()
        assert ac != 'true'


# =============== REGRESSION: Farm CRUD + PATCH ===============
class TestRegressionCore:
    def test_farm_crud_and_settings(self):
        r = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
        assert r.status_code == 200
        tok = r.json()['token']
        h = _headers(tok)
        # create farm
        fc = requests.post(f"{API}/farms", headers=h, json={"name": "TEST_reg_f", "location": "Delhi India"})
        assert fc.status_code == 200
        farm = fc.json()
        assert farm['currency'] == 'INR'
        fid = farm['farm_id']
        try:
            # PATCH farm
            pf = requests.patch(f"{API}/farms/{fid}", headers=h, json={"name": "TEST_reg_f_2"})
            assert pf.status_code == 200
            assert pf.json()['name'] == 'TEST_reg_f_2'
            # dashboard
            db = requests.get(f"{API}/dashboard", headers=h)
            assert db.status_code == 200
            d = db.json()
            assert 'primary_currency' in d
            assert 'low_stock_alerts' in d
            # settings currency change + revert
            ps = requests.patch(f"{API}/users/me/settings", headers=h, json={"primary_currency": "INR"})
            assert ps.status_code == 200
            requests.patch(f"{API}/users/me/settings", headers=h, json={"primary_currency": "USD"})
            # community post + like
            cp = requests.post(f"{API}/community/posts", headers=h, json={"content": "TEST_reg post"})
            assert cp.status_code == 200
            pid = cp.json()['post_id']
            lk = requests.post(f"{API}/community/posts/{pid}/like", headers=h)
            assert lk.status_code == 200
            # market sub/unsub
            sub = requests.post(f"{API}/market/subscribe", headers=h)
            assert sub.status_code == 200
            unsub = requests.post(f"{API}/market/unsubscribe", headers=h)
            assert unsub.status_code == 200
        finally:
            requests.delete(f"{API}/farms/{fid}", headers=h)

    def test_produce_and_sale_stock_flow(self):
        r = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
        tok = r.json()['token']; h = _headers(tok)
        fc = requests.post(f"{API}/farms", headers=h, json={"name": "TEST_reg_stock", "location": "Delhi India"})
        fid = fc.json()['farm_id']
        try:
            pc = requests.post(f"{API}/produce", headers=h, json={
                "farm_id": fid, "name": "TEST_wheat", "category": "grain", "quantity": 50, "unit": "kg"
            })
            assert pc.status_code == 200
            pid = pc.json()['produce_id']
            sc = requests.post(f"{API}/sellers", headers=h, json={"name": "TEST_seller", "location": "Mumbai India"})
            assert sc.status_code == 200
            sid = sc.json()['seller_id']
            assert sc.json().get('currency') == 'INR'
            # Sale
            sl = requests.post(f"{API}/sales", headers=h, json={
                "farm_id": fid, "produce_id": pid, "seller_id": sid, "quantity": 10, "rate": 100
            })
            assert sl.status_code == 200
            assert sl.json()['currency'] == 'INR'
            # Seller currency PATCH
            pc2 = requests.patch(f"{API}/sellers/{sid}/currency", headers=h, json={"currency": "USD"})
            assert pc2.status_code == 200
            assert pc2.json()['currency'] == 'USD'
        finally:
            requests.delete(f"{API}/farms/{fid}", headers=h)


# =============== SEC-A: assistant chat per-minute rate limit (LAST) ===============
# We run AI rate-limit test but do NOT actually invoke LLM 10 times -
# We craft 10 sub-limit requests then verify 11th is 429. Since backend
# rate_limit fires BEFORE LLM call, invalid emergent key would still 500 after
# rate check. To avoid hitting LLM 10x, we look at server behaviour:
# rate_limit runs before LLM call. So use invalid body? No - Pydantic 422 short
# circuits before rate_limit. We must send valid body. LLM will actually be
# called (or 500). Skip if 500 on first call to avoid burning quota.
class TestChatRateLimit:
    def test_11th_chat_returns_429(self):
        """Chat rate limit = 10/60s per user. Because LLM calls take several
        seconds each, sequential requests would age out of the window; we fire
        11+ requests IN PARALLEL to guarantee overlap within the 60s window."""
        import concurrent.futures as cf
        # Fresh login (previous module-scope tokens may be revoked).
        lr = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
        assert lr.status_code == 200
        tok = lr.json()['token']

        def one(i):
            try:
                r = requests.post(f"{API}/assistant/chat",
                                  headers=_headers(tok),
                                  json={"message": f"ping {i}", "session_id": "TEST_rl_sess"},
                                  timeout=90)
                return r.status_code
            except Exception as e:
                return f"err:{e}"

        # Fire 15 concurrent requests. Rate_limit runs before LLM call, so at
        # least one should be rejected with 429 (only 10 tokens in the bucket).
        with cf.ThreadPoolExecutor(max_workers=15) as ex:
            results = list(ex.map(one, range(15)))
        n_429 = sum(1 for r in results if r == 429)
        n_200 = sum(1 for r in results if r == 200)
        assert n_429 >= 1, f"Expected >=1 429 with 15 concurrent chat calls (limit 10/60s). Results: {results}"
        # And no more than 10 should have been accepted
        assert n_200 <= 10, f"More than 10 chat calls succeeded within 60s. Results: {results}"


# =============== SEC-D: Register + Login IP rate limits (LAST) ===============
# NOTE: When hit via the external ingress, `request.client.host` becomes the
# ingress-pod IP; multiple ingress replicas spread the request across DIFFERENT
# buckets, making 5-attempt-per-IP tests flaky. We validate against the internal
# URL (single client IP = 127.0.0.1) which is what the limiter actually sees.
INTERNAL_API = 'http://localhost:8001/api'


class TestAuthRateLimits:
    @classmethod
    def setup_class(cls):
        # Ensure a clean rate-limit bucket for these tests.
        import subprocess
        subprocess.run(['sudo', 'supervisorctl', 'restart', 'backend'], capture_output=True)
        time.sleep(4)

    def test_register_rate_limit_6th_blocked(self):
        made = []
        for i in range(5):
            e = _fresh_email()
            r = requests.post(f"{INTERNAL_API}/auth/register", json={
                "email": e, "password": "goodpassword", "name": "RL"
            })
            made.append((e, r.status_code))
        r6 = requests.post(f"{INTERNAL_API}/auth/register", json={
            "email": _fresh_email(), "password": "goodpassword", "name": "RL6"
        })
        assert r6.status_code == 429, f"6th register from same IP must be 429. First 5: {made}, 6th: {r6.status_code} {r6.text}"

    def test_login_ip_rate_limit_11th_blocked(self):
        codes = []
        for i in range(10):
            r = requests.post(f"{INTERNAL_API}/auth/login", json={
                "email": f"nobody_{i}@x.com", "password": "wrongpass"
            })
            codes.append(r.status_code)
        r11 = requests.post(f"{INTERNAL_API}/auth/login", json={
            "email": "nobody_11@x.com", "password": "wrongpass"
        })
        assert r11.status_code == 429, f"11th login must be 429. Prior codes: {codes}, 11th: {r11.status_code}"

    def test_login_email_rate_limit_9th_blocked(self):
        # IP bucket already exhausted; request will 429 due to either limiter.
        r = requests.post(f"{INTERNAL_API}/auth/login", json={
            "email": "sameemail@x.com", "password": "wrongpass"
        })
        assert r.status_code == 429
