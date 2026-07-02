"""FarmConnect backend regression tests.

Covers: auth (register/login/me), farms, produce, sellers, sales, investments,
dashboard, community, market subscription and AI assistant (Gemini via
emergentintegrations).
"""
import base64
import os
import time
import uuid
import io
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://agri-operations-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

# ---------- Helpers ----------

def _small_jpeg_b64() -> str:
    """Return a small JPEG (with real content variation) as base64."""
    try:
        from PIL import Image, ImageDraw
        img = Image.new('RGB', (96, 96), color=(120, 180, 90))
        d = ImageDraw.Draw(img)
        # add real features so image is not a solid color
        d.rectangle([10, 10, 60, 60], fill=(40, 90, 30))
        d.ellipse([30, 30, 90, 90], fill=(200, 220, 100))
        d.line([0, 0, 95, 95], fill=(10, 10, 10), width=3)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=80)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        # Fallback: 1x1 pixel PNG (still valid)
        px = bytes.fromhex('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63FCFFFF3F0300050001007A6D3F430000000049454E44AE426082')
        return base64.b64encode(px).decode()


@pytest.fixture(scope='module')
def sess():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='module')
def auth(sess):
    """Register a fresh user; return token + user."""
    email = f"TEST_{uuid.uuid4().hex[:10]}@farm.com"
    r = sess.post(f"{API}/auth/register", json={
        'email': email, 'password': 'secret123', 'name': 'TEST Farmer'
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert 'token' in data and 'user' in data
    assert data['user']['email'].lower() == email.lower()
    email = email.lower()
    return {'token': data['token'], 'user': data['user'], 'email': email}


@pytest.fixture(scope='module')
def H(auth):
    return {'Authorization': f"Bearer {auth['token']}"}


# ---------- Root ----------

def test_root(sess):
    r = sess.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get('ok') is True


# ---------- Auth ----------

class TestAuth:
    def test_login_seeded_user(self, sess):
        r = sess.post(f"{API}/auth/login", json={'email': 'test@farm.com', 'password': 'secret123'})
        # If seeded user was reset, register it once
        if r.status_code == 401:
            sess.post(f"{API}/auth/register", json={'email': 'test@farm.com', 'password': 'secret123', 'name': 'Test Farmer'})
            r = sess.post(f"{API}/auth/login", json={'email': 'test@farm.com', 'password': 'secret123'})
        assert r.status_code == 200, r.text
        assert 'token' in r.json()

    def test_login_wrong_password(self, sess):
        r = sess.post(f"{API}/auth/login", json={'email': 'test@farm.com', 'password': 'wrong-pw-xxx'})
        assert r.status_code == 401

    def test_me_requires_token(self, sess):
        r = sess.get(f"{API}/me")
        assert r.status_code == 401

    def test_me_invalid_token(self, sess):
        r = sess.get(f"{API}/me", headers={'Authorization': 'Bearer garbage.token.here'})
        assert r.status_code == 401

    def test_me_ok(self, sess, H, auth):
        r = sess.get(f"{API}/me", headers=H)
        assert r.status_code == 200
        u = r.json()
        assert u['email'] == auth['email']
        assert 'password_hash' not in u
        assert '_id' not in u

    def test_register_duplicate(self, sess, auth):
        r = sess.post(f"{API}/auth/register", json={'email': auth['email'], 'password': 'x', 'name': 'x'})
        assert r.status_code == 400


# ---------- Farms / Produce / Sellers / Sales / Investments ----------

class TestFarmFlow:
    farm_id = None
    produce_id = None
    seller_id = None

    def test_create_farm(self, sess, H):
        r = sess.post(f"{API}/farms", headers=H, json={'name': 'TEST Green Acres', 'location': 'Punjab', 'size_acres': 12.5})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['name'] == 'TEST Green Acres'
        assert 'farm_id' in d
        assert '_id' not in d
        TestFarmFlow.farm_id = d['farm_id']

    def test_list_farms(self, sess, H):
        r = sess.get(f"{API}/farms", headers=H)
        assert r.status_code == 200
        farms = r.json()
        assert any(f['farm_id'] == TestFarmFlow.farm_id for f in farms)

    def test_produce_bad_farm(self, sess, H):
        r = sess.post(f"{API}/produce", headers=H, json={
            'farm_id': 'f_doesnotexist', 'name': 'Wheat', 'category': 'Grain', 'quantity': 10
        })
        assert r.status_code == 404

    def test_create_produce(self, sess, H):
        r = sess.post(f"{API}/produce", headers=H, json={
            'farm_id': TestFarmFlow.farm_id, 'name': 'Wheat', 'category': 'Grain',
            'quantity': 500, 'unit': 'kg'
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['category'] == 'Grain'
        TestFarmFlow.produce_id = d['produce_id']

    def test_create_seller(self, sess, H):
        # Provide location so currency is auto-detected (required for sale creation now)
        r = sess.post(f"{API}/sellers", headers=H, json={'name': 'TEST Mandi', 'contact': '999', 'location': 'Punjab, India'})
        assert r.status_code == 200
        d = r.json()
        assert d.get('currency') == 'INR'
        TestFarmFlow.seller_id = d['seller_id']

    def test_list_sellers(self, sess, H):
        r = sess.get(f"{API}/sellers", headers=H)
        assert r.status_code == 200
        assert any(s['seller_id'] == TestFarmFlow.seller_id for s in r.json())

    def test_create_sale_computes_total(self, sess, H):
        r = sess.post(f"{API}/sales", headers=H, json={
            'farm_id': TestFarmFlow.farm_id,
            'produce_id': TestFarmFlow.produce_id,
            'seller_id': TestFarmFlow.seller_id,
            'quantity': 100, 'rate': 25.5,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['total'] == round(100 * 25.5, 2)

    def test_list_sales(self, sess, H):
        r = sess.get(f"{API}/sales", headers=H, params={'farm_id': TestFarmFlow.farm_id})
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_create_investment(self, sess, H):
        r = sess.post(f"{API}/investments", headers=H, json={
            'farm_id': TestFarmFlow.farm_id, 'category': 'Seeds', 'amount': 1200
        })
        assert r.status_code == 200
        assert r.json()['amount'] == 1200

    def test_list_investments(self, sess, H):
        r = sess.get(f"{API}/investments", headers=H, params={'farm_id': TestFarmFlow.farm_id})
        assert r.status_code == 200
        assert any(i['category'] == 'Seeds' for i in r.json())


# ---------- Dashboard ----------

class TestDashboard:
    @pytest.mark.parametrize('period', ['daily', 'weekly', 'monthly'])
    def test_dashboard(self, sess, H, period):
        r = sess.get(f"{API}/dashboard", headers=H, params={'period': period})
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ('total_revenue', 'total_investment', 'profit', 'avg_rate',
                  'sales_by_category', 'investment_by_category', 'period'):
            assert k in d, f"missing {k}"
        assert d['period'] == period
        # Grain sale of 100*25.5 = ₹2550 (seller was Punjab/India → INR).
        # Dashboard now converts to user's primary_currency (default USD).
        # ₹2550 ≈ $30.72 at INR/USD=83. revenue_by_currency preserves native amount.
        assert d.get('revenue_by_currency', {}).get('INR', 0) >= 2550
        # Investment (no currency override) → INR (farm currency) → ~$14.4 in USD
        # Just verify structure & positive values
        assert d['total_revenue'] > 0
        assert d['total_investment'] > 0
        assert d['sales_by_category'].get('Grain', 0) > 0
        assert d['investment_by_category'].get('Seeds', 0) > 0
        # New iter-3 fields
        assert 'primary_currency' in d
        assert 'primary_symbol' in d
        assert 'low_stock_alerts' in d


# ---------- Community ----------

class TestCommunity:
    post_id = None

    def test_create_post(self, sess, H):
        r = sess.post(f"{API}/community/posts", headers=H, json={'content': 'TEST hello farm'})
        assert r.status_code == 200
        d = r.json()
        assert d['content'] == 'TEST hello farm'
        TestCommunity.post_id = d['post_id']

    def test_list_posts(self, sess, H):
        r = sess.get(f"{API}/community/posts", headers=H)
        assert r.status_code == 200
        assert any(p['post_id'] == TestCommunity.post_id for p in r.json())

    def test_like_post(self, sess, H):
        r = sess.post(f"{API}/community/posts/{TestCommunity.post_id}/like", headers=H)
        assert r.status_code == 200


# ---------- Market ----------

class TestMarket:
    def test_listings(self, sess, H):
        r = sess.get(f"{API}/market/listings", headers=H)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get('listings'), list) and len(d['listings']) >= 1

    def test_subscribe_unsubscribe(self, sess, H):
        r = sess.post(f"{API}/market/subscribe", headers=H)
        assert r.status_code == 200 and r.json()['active'] is True
        me = sess.get(f"{API}/me", headers=H).json()
        assert me['subscription']['active'] is True
        r = sess.post(f"{API}/market/unsubscribe", headers=H)
        assert r.status_code == 200 and r.json()['active'] is False
        me = sess.get(f"{API}/me", headers=H).json()
        assert me['subscription']['active'] is False


# ---------- AI Assistant ----------

class TestAssistant:
    def test_chat_text(self, sess, H):
        r = sess.post(f"{API}/assistant/chat", headers=H, json={
            'message': 'In one sentence: is nitrogen important for wheat?'
        }, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get('reply'), str) and len(d['reply']) > 5
        assert 'session_id' in d

    def test_chat_image(self, sess, H):
        b64 = _small_jpeg_b64()
        r = sess.post(f"{API}/assistant/chat", headers=H, json={
            'message': 'Describe any visible issues on this plant leaf briefly.',
            'image_base64': b64,
        }, timeout=120)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert isinstance(d.get('reply'), str) and len(d['reply']) > 5


# ---------- Cleanup (delete farm cascades) ----------

def test_delete_farm(sess, H):
    fid = TestFarmFlow.farm_id
    if not fid:
        pytest.skip('no farm created')
    r = sess.delete(f"{API}/farms/{fid}", headers=H)
    assert r.status_code == 200
    # Verify cascade
    r = sess.get(f"{API}/produce", headers=H, params={'farm_id': fid})
    assert r.status_code == 200 and r.json() == []
