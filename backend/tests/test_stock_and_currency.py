"""Iteration-2 focused tests: stock limits + currency features.

Covers:
- POST /api/sales rejects when quantity > stock; atomic decrement on success
- Stock=0 subsequent rejection
- POST /api/sellers auto-detects currency from location (INR/GBP/EUR/USD/null)
- PATCH /api/sellers/{id}/currency (auth + bad code + non-owner)
- Sale currency propagation, seller/produce name populated
- Sale rejected when seller has no currency
- Dashboard revenue_by_currency includes multiple currencies
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://agri-operations-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope='module')
def sess():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


def _register(sess):
    email = f"TEST_{uuid.uuid4().hex[:10]}@farm.com"
    r = sess.post(f"{API}/auth/register", json={'email': email, 'password': 'secret123', 'name': 'TEST'})
    assert r.status_code == 200, r.text
    return r.json()['token'], email


@pytest.fixture(scope='module')
def auth1(sess):
    token, email = _register(sess)
    return {'H': {'Authorization': f'Bearer {token}'}, 'email': email}


@pytest.fixture(scope='module')
def auth2(sess):
    token, email = _register(sess)
    return {'H': {'Authorization': f'Bearer {token}'}, 'email': email}


@pytest.fixture(scope='module')
def farm(sess, auth1):
    r = sess.post(f"{API}/farms", headers=auth1['H'],
                  json={'name': 'TEST Stock Farm', 'location': 'Punjab, India', 'size_acres': 5})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope='module')
def produce(sess, auth1, farm):
    r = sess.post(f"{API}/produce", headers=auth1['H'],
                  json={'farm_id': farm['farm_id'], 'name': 'Wheat', 'category': 'Grain',
                        'quantity': 100, 'unit': 'kg'})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['quantity'] == 100
    return d


# ---------- Currency detection on seller create ----------

class TestSellerCurrencyDetection:
    def test_india_infers_inr(self, sess, auth1):
        r = sess.post(f"{API}/sellers", headers=auth1['H'],
                      json={'name': 'TEST Delhi Mandi', 'location': 'Delhi, India'})
        assert r.status_code == 200, r.text
        assert r.json()['currency'] == 'INR'

    def test_london_infers_gbp(self, sess, auth1):
        r = sess.post(f"{API}/sellers", headers=auth1['H'],
                      json={'name': 'TEST London Buyer', 'location': 'London, UK'})
        assert r.status_code == 200
        assert r.json()['currency'] == 'GBP'

    def test_paris_infers_eur(self, sess, auth1):
        r = sess.post(f"{API}/sellers", headers=auth1['H'],
                      json={'name': 'TEST Paris Buyer', 'location': 'Paris, France'})
        assert r.status_code == 200
        assert r.json()['currency'] == 'EUR'

    def test_ny_infers_usd(self, sess, auth1):
        r = sess.post(f"{API}/sellers", headers=auth1['H'],
                      json={'name': 'TEST NY Buyer', 'location': 'New York, USA'})
        assert r.status_code == 200
        assert r.json()['currency'] == 'USD'

    def test_no_location_no_currency(self, sess, auth1):
        r = sess.post(f"{API}/sellers", headers=auth1['H'],
                      json={'name': 'TEST NoLoc'})
        assert r.status_code == 200
        assert r.json().get('currency') in (None, '')


# ---------- PATCH seller currency ----------

class TestPatchSellerCurrency:
    seller_id = None

    def test_setup_seller_without_currency(self, sess, auth1):
        r = sess.post(f"{API}/sellers", headers=auth1['H'],
                      json={'name': 'TEST NoCur Seller'})
        assert r.status_code == 200
        d = r.json()
        assert d.get('currency') in (None, '')
        TestPatchSellerCurrency.seller_id = d['seller_id']

    def test_patch_ok(self, sess, auth1):
        sid = TestPatchSellerCurrency.seller_id
        r = sess.patch(f"{API}/sellers/{sid}/currency", headers=auth1['H'], json={'currency': 'INR'})
        assert r.status_code == 200, r.text
        assert r.json()['currency'] == 'INR'

    def test_patch_bad_code(self, sess, auth1):
        sid = TestPatchSellerCurrency.seller_id
        r = sess.patch(f"{API}/sellers/{sid}/currency", headers=auth1['H'], json={'currency': 'ZZZ'})
        assert r.status_code == 400

    def test_patch_unauth(self, sess):
        sid = TestPatchSellerCurrency.seller_id
        r = sess.patch(f"{API}/sellers/{sid}/currency", json={'currency': 'USD'})
        assert r.status_code == 401

    def test_patch_non_owner(self, sess, auth2):
        sid = TestPatchSellerCurrency.seller_id
        r = sess.patch(f"{API}/sellers/{sid}/currency", headers=auth2['H'], json={'currency': 'USD'})
        assert r.status_code == 404


# ---------- Sales: stock enforcement + atomic decrement + currency propagation ----------

class TestSaleStockAndCurrency:
    seller_inr_id = None
    seller_usd_id = None
    seller_nocur_id = None

    def test_setup_sellers(self, sess, auth1):
        # INR seller
        r1 = sess.post(f"{API}/sellers", headers=auth1['H'],
                       json={'name': 'TEST INR Buyer', 'location': 'Mumbai, India'})
        assert r1.status_code == 200 and r1.json()['currency'] == 'INR'
        TestSaleStockAndCurrency.seller_inr_id = r1.json()['seller_id']

        # USD seller
        r2 = sess.post(f"{API}/sellers", headers=auth1['H'],
                       json={'name': 'TEST USD Buyer', 'location': 'Chicago, USA'})
        assert r2.status_code == 200 and r2.json()['currency'] == 'USD'
        TestSaleStockAndCurrency.seller_usd_id = r2.json()['seller_id']

        # No-currency seller
        r3 = sess.post(f"{API}/sellers", headers=auth1['H'],
                       json={'name': 'TEST NoCur Seller2'})
        assert r3.status_code == 200 and r3.json().get('currency') in (None, '')
        TestSaleStockAndCurrency.seller_nocur_id = r3.json()['seller_id']

    def test_sale_rejected_no_currency(self, sess, auth1, farm, produce):
        r = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': farm['farm_id'],
            'produce_id': produce['produce_id'],
            'seller_id': TestSaleStockAndCurrency.seller_nocur_id,
            'quantity': 5, 'rate': 20,
        })
        assert r.status_code == 400, r.text
        assert 'currency' in r.text.lower()

    def test_sale_rejected_over_stock(self, sess, auth1, farm, produce):
        r = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': farm['farm_id'],
            'produce_id': produce['produce_id'],
            'seller_id': TestSaleStockAndCurrency.seller_inr_id,
            'quantity': 999, 'rate': 30,
        })
        assert r.status_code == 400, r.text
        assert 'stock' in r.text.lower() or 'enough' in r.text.lower()

    def test_sale_ok_inr_decrements_stock(self, sess, auth1, farm, produce):
        # produce starts at 100 kg; sell 40 in INR
        r = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': farm['farm_id'],
            'produce_id': produce['produce_id'],
            'seller_id': TestSaleStockAndCurrency.seller_inr_id,
            'quantity': 40, 'rate': 30,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['currency'] == 'INR'
        assert d['produce_name'] == 'Wheat'
        assert d['seller_name'] == 'TEST INR Buyer'
        assert d['total'] == 1200.0

        # Verify GET /produce reflects decrement
        r2 = sess.get(f"{API}/produce", headers=auth1['H'],
                      params={'farm_id': farm['farm_id']})
        assert r2.status_code == 200
        p = next(x for x in r2.json() if x['produce_id'] == produce['produce_id'])
        assert p['quantity'] == 60, f"Expected 60, got {p['quantity']}"

    def test_sale_ok_usd(self, sess, auth1, farm, produce):
        # sell 20 in USD; stock should go 60→40
        r = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': farm['farm_id'],
            'produce_id': produce['produce_id'],
            'seller_id': TestSaleStockAndCurrency.seller_usd_id,
            'quantity': 20, 'rate': 5,
        })
        assert r.status_code == 200, r.text
        assert r.json()['currency'] == 'USD'
        assert r.json()['total'] == 100.0

        r2 = sess.get(f"{API}/produce", headers=auth1['H'],
                      params={'farm_id': farm['farm_id']})
        p = next(x for x in r2.json() if x['produce_id'] == produce['produce_id'])
        assert p['quantity'] == 40

    def test_dashboard_revenue_by_currency(self, sess, auth1):
        r = sess.get(f"{API}/dashboard", headers=auth1['H'], params={'period': 'monthly'})
        assert r.status_code == 200, r.text
        d = r.json()
        assert 'revenue_by_currency' in d
        rbc = d['revenue_by_currency']
        assert rbc.get('INR', 0) >= 1200
        assert rbc.get('USD', 0) >= 100

    def test_sell_remaining_and_deplete(self, sess, auth1, farm, produce):
        # 40 remaining → sell all 40
        r = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': farm['farm_id'],
            'produce_id': produce['produce_id'],
            'seller_id': TestSaleStockAndCurrency.seller_inr_id,
            'quantity': 40, 'rate': 10,
        })
        assert r.status_code == 200, r.text
        # Now stock 0 – next sale must be rejected
        r2 = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': farm['farm_id'],
            'produce_id': produce['produce_id'],
            'seller_id': TestSaleStockAndCurrency.seller_inr_id,
            'quantity': 1, 'rate': 10,
        })
        assert r2.status_code == 400, r2.text


# ---------- Cleanup ----------

def test_cleanup(sess, auth1, farm):
    sess.delete(f"{API}/farms/{farm['farm_id']}", headers=auth1['H'])
