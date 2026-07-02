"""Iteration-3 tests: system-wide currency, FX, farm settings, low-stock alerts, investment currency.

Covers:
- PATCH /api/users/me/settings (primary_currency)
- GET /api/fx/rates (unauth, base=USD)
- Dashboard currency conversion (primary_currency + primary_symbol + total_revenue)
- POST /api/farms auto-detects currency + default_unit from location
- PATCH /api/farms/{id} update currency/unit/location
- POST /api/investments currency picker (default from farm, override, bad code)
- POST /api/produce low_stock_threshold + unit inheritance
- Dashboard low_stock_alerts
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
    r = sess.post(f"{API}/auth/register", json={'email': email, 'password': 'secret123', 'name': 'TEST Iter3'})
    assert r.status_code == 200, r.text
    return r.json()['token'], email


@pytest.fixture(scope='module')
def auth1(sess):
    token, email = _register(sess)
    return {'H': {'Authorization': f'Bearer {token}'}, 'email': email, 'token': token}


@pytest.fixture(scope='module')
def auth2(sess):
    token, email = _register(sess)
    return {'H': {'Authorization': f'Bearer {token}'}, 'email': email}


# ---------- FX rates (public) ----------
class TestFxRates:
    def test_fx_rates_unauth(self, sess):
        r = sess.get(f"{API}/fx/rates")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['base'] == 'USD'
        rates = d['rates']
        # tolerate slightly different reference rates
        assert 70 <= rates['INR'] <= 100
        assert 0.8 <= rates['EUR'] <= 1.1
        assert 0.6 <= rates['GBP'] <= 0.95
        assert rates['USD'] == 1.0


# ---------- Settings ----------
class TestUserSettings:
    def test_unauth_401(self, sess):
        r = sess.patch(f"{API}/users/me/settings", json={'primary_currency': 'INR'})
        assert r.status_code == 401

    def test_bad_currency_400(self, sess, auth1):
        r = sess.patch(f"{API}/users/me/settings", headers=auth1['H'], json={'primary_currency': 'ZZZ'})
        assert r.status_code == 400

    def test_reset_to_usd_baseline(self, sess, auth1):
        r = sess.patch(f"{API}/users/me/settings", headers=auth1['H'], json={'primary_currency': 'USD'})
        assert r.status_code == 200
        assert r.json()['primary_currency'] == 'USD'
        # verify GET /me reflects
        me = sess.get(f"{API}/me", headers=auth1['H']).json()
        assert me['primary_currency'] == 'USD'

    def test_update_to_inr_and_persist(self, sess, auth1):
        r = sess.patch(f"{API}/users/me/settings", headers=auth1['H'], json={'primary_currency': 'INR'})
        assert r.status_code == 200
        assert r.json()['primary_currency'] == 'INR'
        me = sess.get(f"{API}/me", headers=auth1['H']).json()
        assert me['primary_currency'] == 'INR'
        # reset back to USD for later tests
        sess.patch(f"{API}/users/me/settings", headers=auth1['H'], json={'primary_currency': 'USD'})


# ---------- Farm auto-detect ----------
class TestFarmAutoDetect:
    def test_farm_london_gbp_kg(self, sess, auth1):
        r = sess.post(f"{API}/farms", headers=auth1['H'],
                      json={'name': 'TEST F London', 'location': 'London, UK', 'size_acres': 1})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['currency'] == 'GBP'
        assert d['default_unit'] == 'kg'

    def test_farm_ny_usd_lb(self, sess, auth1):
        r = sess.post(f"{API}/farms", headers=auth1['H'],
                      json={'name': 'TEST F NY', 'location': 'New York, USA', 'size_acres': 1})
        assert r.status_code == 200
        d = r.json()
        assert d['currency'] == 'USD'
        assert d['default_unit'] == 'lb'

    def test_farm_delhi_inr_kg(self, sess, auth1):
        r = sess.post(f"{API}/farms", headers=auth1['H'],
                      json={'name': 'TEST F Delhi', 'location': 'Delhi, India', 'size_acres': 1})
        assert r.status_code == 200
        d = r.json()
        assert d['currency'] == 'INR'
        assert d['default_unit'] == 'kg'

    def test_farm_no_location_uses_user_primary(self, sess, auth1):
        # Set primary to EUR then create no-location farm
        sess.patch(f"{API}/users/me/settings", headers=auth1['H'], json={'primary_currency': 'EUR'})
        r = sess.post(f"{API}/farms", headers=auth1['H'],
                      json={'name': 'TEST F NoLoc', 'size_acres': 1})
        assert r.status_code == 200
        d = r.json()
        assert d['currency'] == 'EUR'
        assert d['default_unit'] == 'kg'
        # restore USD
        sess.patch(f"{API}/users/me/settings", headers=auth1['H'], json={'primary_currency': 'USD'})

    def test_farm_explicit_overrides(self, sess, auth1):
        r = sess.post(f"{API}/farms", headers=auth1['H'],
                      json={'name': 'TEST F Override', 'location': 'Delhi, India',
                            'currency': 'USD', 'default_unit': 'quintal'})
        assert r.status_code == 200
        d = r.json()
        assert d['currency'] == 'USD'
        assert d['default_unit'] == 'quintal'


# ---------- Farm update ----------
class TestFarmUpdate:
    farm_id = None

    def test_setup_farm(self, sess, auth1):
        r = sess.post(f"{API}/farms", headers=auth1['H'],
                      json={'name': 'TEST FUpdate', 'location': 'Punjab, India', 'size_acres': 3})
        assert r.status_code == 200
        d = r.json()
        assert d['currency'] == 'INR'
        TestFarmUpdate.farm_id = d['farm_id']

    def test_update_ok(self, sess, auth1):
        fid = TestFarmUpdate.farm_id
        r = sess.patch(f"{API}/farms/{fid}", headers=auth1['H'],
                       json={'currency': 'EUR', 'default_unit': 'quintal', 'location': 'Paris, France'})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['currency'] == 'EUR'
        assert d['default_unit'] == 'quintal'
        assert 'Paris' in d.get('location', '')

    def test_update_bad_currency(self, sess, auth1):
        fid = TestFarmUpdate.farm_id
        r = sess.patch(f"{API}/farms/{fid}", headers=auth1['H'], json={'currency': 'ZZZ'})
        assert r.status_code == 400

    def test_update_non_owner_404(self, sess, auth2):
        fid = TestFarmUpdate.farm_id
        r = sess.patch(f"{API}/farms/{fid}", headers=auth2['H'], json={'currency': 'USD'})
        assert r.status_code == 404

    def test_update_bad_id_404(self, sess, auth1):
        r = sess.patch(f"{API}/farms/f_doesnotexist", headers=auth1['H'], json={'currency': 'USD'})
        assert r.status_code == 404


# ---------- Investment currency ----------
class TestInvestmentCurrency:
    farm_id = None

    def test_setup(self, sess, auth1):
        r = sess.post(f"{API}/farms", headers=auth1['H'],
                      json={'name': 'TEST InvFarm', 'location': 'Mumbai, India', 'size_acres': 2})
        assert r.status_code == 200
        assert r.json()['currency'] == 'INR'
        TestInvestmentCurrency.farm_id = r.json()['farm_id']

    def test_investment_defaults_farm_currency(self, sess, auth1):
        r = sess.post(f"{API}/investments", headers=auth1['H'],
                      json={'farm_id': TestInvestmentCurrency.farm_id, 'category': 'Seeds', 'amount': 500})
        assert r.status_code == 200, r.text
        assert r.json()['currency'] == 'INR'

    def test_investment_explicit_override(self, sess, auth1):
        r = sess.post(f"{API}/investments", headers=auth1['H'],
                      json={'farm_id': TestInvestmentCurrency.farm_id, 'category': 'Tools',
                            'amount': 100, 'currency': 'USD'})
        assert r.status_code == 200
        assert r.json()['currency'] == 'USD'

    def test_investment_bad_currency(self, sess, auth1):
        r = sess.post(f"{API}/investments", headers=auth1['H'],
                      json={'farm_id': TestInvestmentCurrency.farm_id, 'category': 'X',
                            'amount': 10, 'currency': 'ZZZ'})
        assert r.status_code == 400


# ---------- Produce low_stock + unit inheritance ----------
class TestProduceLowStock:
    farm_id = None
    seller_id = None
    produce_id = None

    def test_setup(self, sess, auth1):
        r = sess.post(f"{API}/farms", headers=auth1['H'],
                      json={'name': 'TEST LSFarm', 'location': 'New York, USA', 'size_acres': 2})
        assert r.status_code == 200
        assert r.json()['default_unit'] == 'lb'
        TestProduceLowStock.farm_id = r.json()['farm_id']

        rs = sess.post(f"{API}/sellers", headers=auth1['H'],
                       json={'name': 'TEST LS Buyer', 'location': 'Chicago, USA'})
        assert rs.status_code == 200 and rs.json()['currency'] == 'USD'
        TestProduceLowStock.seller_id = rs.json()['seller_id']

    def test_create_produce_inherits_unit_and_threshold(self, sess, auth1):
        # omit unit → should inherit farm.default_unit = 'lb'
        r = sess.post(f"{API}/produce", headers=auth1['H'],
                      json={'farm_id': TestProduceLowStock.farm_id, 'name': 'Corn',
                            'category': 'Grain', 'quantity': 100, 'low_stock_threshold': 20})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['unit'] == 'lb'
        assert d['low_stock_threshold'] == 20
        TestProduceLowStock.produce_id = d['produce_id']

    def test_get_produce_returns_threshold(self, sess, auth1):
        r = sess.get(f"{API}/produce", headers=auth1['H'],
                     params={'farm_id': TestProduceLowStock.farm_id})
        p = next(x for x in r.json() if x['produce_id'] == TestProduceLowStock.produce_id)
        assert p['low_stock_threshold'] == 20
        assert p['unit'] == 'lb'

    def test_sell_down_and_get_low_stock_alert(self, sess, auth1):
        # Sell 85 (100 → 15), which is <= threshold 20
        r = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': TestProduceLowStock.farm_id,
            'produce_id': TestProduceLowStock.produce_id,
            'seller_id': TestProduceLowStock.seller_id,
            'quantity': 85, 'rate': 2,
        })
        assert r.status_code == 200, r.text

        # dashboard.low_stock_alerts should include this produce
        d = sess.get(f"{API}/dashboard", headers=auth1['H'], params={'period': 'monthly'}).json()
        assert 'low_stock_alerts' in d
        alerts = d['low_stock_alerts']
        match = [a for a in alerts if a.get('produce_id') == TestProduceLowStock.produce_id]
        assert len(match) == 1, f"Alert not found; got {alerts}"
        assert match[0]['quantity'] == 15
        assert match[0]['threshold'] == 20


# ---------- Dashboard currency conversion ----------
class TestDashboardConversion:
    farm_id = None
    produce_id = None
    seller_usd = None
    seller_inr = None

    def test_setup(self, sess, auth1):
        # ensure user primary starts at USD
        sess.patch(f"{API}/users/me/settings", headers=auth1['H'], json={'primary_currency': 'USD'})

        r = sess.post(f"{API}/farms", headers=auth1['H'],
                      json={'name': 'TEST ConvFarm', 'location': 'Delhi, India', 'size_acres': 5})
        assert r.status_code == 200
        TestDashboardConversion.farm_id = r.json()['farm_id']

        p = sess.post(f"{API}/produce", headers=auth1['H'],
                      json={'farm_id': TestDashboardConversion.farm_id, 'name': 'Rice',
                            'category': 'Grain', 'quantity': 1000, 'unit': 'kg'})
        assert p.status_code == 200
        TestDashboardConversion.produce_id = p.json()['produce_id']

        su = sess.post(f"{API}/sellers", headers=auth1['H'],
                       json={'name': 'TEST Conv USD', 'location': 'New York, USA'})
        assert su.status_code == 200
        TestDashboardConversion.seller_usd = su.json()['seller_id']

        si = sess.post(f"{API}/sellers", headers=auth1['H'],
                       json={'name': 'TEST Conv INR', 'location': 'Delhi, India'})
        assert si.status_code == 200
        TestDashboardConversion.seller_inr = si.json()['seller_id']

    def test_create_two_sales(self, sess, auth1):
        # $100 USD sale (qty 10 * rate 10)
        r1 = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': TestDashboardConversion.farm_id,
            'produce_id': TestDashboardConversion.produce_id,
            'seller_id': TestDashboardConversion.seller_usd,
            'quantity': 10, 'rate': 10,
        })
        assert r1.status_code == 200, r1.text
        assert r1.json()['currency'] == 'USD'
        assert r1.json()['total'] == 100

        # ₹8300 INR sale (qty 83 * rate 100)
        r2 = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': TestDashboardConversion.farm_id,
            'produce_id': TestDashboardConversion.produce_id,
            'seller_id': TestDashboardConversion.seller_inr,
            'quantity': 83, 'rate': 100,
        })
        assert r2.status_code == 200, r2.text
        assert r2.json()['currency'] == 'INR'
        assert r2.json()['total'] == 8300

    def test_dashboard_in_inr(self, sess, auth1):
        # Note: user might have other TEST sales from earlier fixtures.
        # Use farm_id filter is not supported for dashboard; instead we just check
        # that the two sales' contributions are present in totals & currency mapping is correct.
        sess.patch(f"{API}/users/me/settings", headers=auth1['H'], json={'primary_currency': 'INR'})
        d = sess.get(f"{API}/dashboard", headers=auth1['H'], params={'period': 'monthly'}).json()
        assert d['primary_currency'] == 'INR'
        assert d['primary_symbol'] == '\u20b9'  # ₹
        # Expected contribution: 100 USD → 8300 INR + 8300 INR = 16600 INR (minimum)
        assert d['total_revenue'] >= 16600 * 0.95, f"total_revenue={d['total_revenue']}"

    def test_dashboard_in_usd(self, sess, auth1):
        sess.patch(f"{API}/users/me/settings", headers=auth1['H'], json={'primary_currency': 'USD'})
        d = sess.get(f"{API}/dashboard", headers=auth1['H'], params={'period': 'monthly'}).json()
        assert d['primary_currency'] == 'USD'
        assert d['primary_symbol'] == '$'
        # Expected: 100 + 8300/83 = 200 USD (min)
        assert d['total_revenue'] >= 200 * 0.95, f"total_revenue={d['total_revenue']}"


# ---------- Regression: root, existing endpoints ----------
class TestRegression:
    def test_root(self, sess):
        r = sess.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get('ok') is True

    def test_currencies_list(self, sess):
        r = sess.get(f"{API}/currencies")
        assert r.status_code == 200
        codes = {c['code'] for c in r.json()}
        assert {'USD', 'INR', 'EUR', 'GBP'} <= codes

    def test_market_listings(self, sess, auth1):
        r = sess.get(f"{API}/market/listings", headers=auth1['H'])
        assert r.status_code == 200
        assert isinstance(r.json().get('listings'), list)

    def test_market_subscribe_unsubscribe(self, sess, auth1):
        r = sess.post(f"{API}/market/subscribe", headers=auth1['H'])
        assert r.status_code == 200 and r.json()['active'] is True
        r = sess.post(f"{API}/market/unsubscribe", headers=auth1['H'])
        assert r.status_code == 200 and r.json()['active'] is False

    def test_community_post_and_like(self, sess, auth1):
        r = sess.post(f"{API}/community/posts", headers=auth1['H'], json={'content': 'TEST iter3'})
        assert r.status_code == 200
        pid = r.json()['post_id']
        r2 = sess.post(f"{API}/community/posts/{pid}/like", headers=auth1['H'])
        assert r2.status_code == 200

    def test_seller_currency_still_enforced(self, sess, auth1):
        # Create farm & produce & no-currency seller, verify sale rejected
        rf = sess.post(f"{API}/farms", headers=auth1['H'],
                       json={'name': 'TEST reg farm', 'location': 'Delhi, India', 'size_acres': 1})
        assert rf.status_code == 200
        fid = rf.json()['farm_id']

        rp = sess.post(f"{API}/produce", headers=auth1['H'],
                       json={'farm_id': fid, 'name': 'X', 'category': 'Y', 'quantity': 10})
        assert rp.status_code == 200

        rs = sess.post(f"{API}/sellers", headers=auth1['H'], json={'name': 'TEST NoCur Reg'})
        assert rs.status_code == 200

        r = sess.post(f"{API}/sales", headers=auth1['H'], json={
            'farm_id': fid, 'produce_id': rp.json()['produce_id'],
            'seller_id': rs.json()['seller_id'], 'quantity': 5, 'rate': 10,
        })
        assert r.status_code == 400
