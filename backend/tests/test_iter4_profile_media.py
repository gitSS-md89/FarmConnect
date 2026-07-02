"""Iter-4 tests: profile picture, background image, farm logo, farm-detail INR MiniStats bug."""
import os
import pytest
import requests

BASE_URL = (os.environ.get('EXPO_BACKEND_URL') or os.environ.get('EXPO_PUBLIC_BACKEND_URL') or 'https://agri-operations-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
TINY_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////AAP//"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": "test@farm.com", "password": "secret123"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    # Reset profile media + primary currency for predictable state
    h = {"Authorization": f"Bearer {tok}"}
    requests.patch(f"{API}/users/me/settings", json={"primary_currency": "USD"}, headers=h)
    requests.patch(f"{API}/users/me/settings", json={"picture": ""}, headers=h)
    requests.patch(f"{API}/users/me/settings", json={"background_image": ""}, headers=h)
    return tok


@pytest.fixture
def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- User picture / background ----------

class TestUserProfileMedia:
    def test_set_picture(self, h):
        r = requests.patch(f"{API}/users/me/settings", json={"picture": TINY_B64}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["picture"] == TINY_B64
        me = requests.get(f"{API}/me", headers=h).json()
        assert me["picture"] == TINY_B64

    def test_clear_picture(self, h):
        r = requests.patch(f"{API}/users/me/settings", json={"picture": ""}, headers=h)
        assert r.status_code == 200
        assert r.json()["picture"] is None
        me = requests.get(f"{API}/me", headers=h).json()
        assert me["picture"] is None

    def test_set_background(self, h):
        r = requests.patch(f"{API}/users/me/settings", json={"background_image": TINY_B64}, headers=h)
        assert r.status_code == 200
        assert r.json()["background_image"] == TINY_B64

    def test_clear_background(self, h):
        r = requests.patch(f"{API}/users/me/settings", json={"background_image": ""}, headers=h)
        assert r.status_code == 200
        assert r.json()["background_image"] is None

    def test_settings_unauth(self):
        r = requests.patch(f"{API}/users/me/settings", json={"picture": TINY_B64})
        assert r.status_code == 401


# ---------- Farm logo ----------

class TestFarmLogo:
    @pytest.fixture(autouse=True)
    def _farm(self, h):
        r = requests.post(f"{API}/farms", json={"name": "TEST_LogoFarm", "location": "Delhi, India"}, headers=h)
        assert r.status_code == 200
        self.farm = r.json()
        yield
        requests.delete(f"{API}/farms/{self.farm['farm_id']}", headers=h)

    def test_patch_logo(self, h):
        r = requests.patch(f"{API}/farms/{self.farm['farm_id']}", json={"logo": TINY_B64}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["logo"] == TINY_B64
        # Verify persisted via list
        farms = requests.get(f"{API}/farms", headers=h).json()
        got = next(f for f in farms if f["farm_id"] == self.farm["farm_id"])
        assert got["logo"] == TINY_B64

    def test_patch_logo_unauth(self):
        r = requests.patch(f"{API}/farms/{self.farm['farm_id']}", json={"logo": TINY_B64})
        assert r.status_code == 401

    def test_patch_logo_bad_id(self, h):
        r = requests.patch(f"{API}/farms/f_doesnotexist", json={"logo": TINY_B64}, headers=h)
        assert r.status_code == 404


# ---------- Farm-detail INR ministats bug ----------

class TestFarmDetailINR:
    @pytest.fixture(autouse=True)
    def _setup(self, h):
        # 1) Farm in Delhi, India -> INR
        r = requests.post(f"{API}/farms", json={"name": "TEST_INRFarm", "location": "Delhi, India"}, headers=h)
        farm = r.json()
        assert farm["currency"] == "INR", farm
        # 2) Produce 100 kg
        r = requests.post(f"{API}/produce", json={
            "farm_id": farm["farm_id"], "name": "Wheat", "category": "Grain", "quantity": 100,
        }, headers=h)
        prod = r.json()
        # 3) Seller in India (INR)
        r = requests.post(f"{API}/sellers", json={"name": "TEST_SellerIN", "location": "Mumbai, India"}, headers=h)
        seller = r.json()
        assert seller["currency"] == "INR", seller
        # 4) Sale 10 @ 100 INR = 1000
        r = requests.post(f"{API}/sales", json={
            "farm_id": farm["farm_id"], "produce_id": prod["produce_id"],
            "seller_id": seller["seller_id"], "quantity": 10, "rate": 100,
        }, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["currency"] == "INR"
        assert r.json()["total"] == 1000
        # 5) Investment 500 INR
        r = requests.post(f"{API}/investments", json={
            "farm_id": farm["farm_id"], "category": "Seeds", "amount": 500, "currency": "INR",
        }, headers=h)
        assert r.status_code == 200
        assert r.json()["currency"] == "INR"
        self.farm = farm
        yield
        requests.delete(f"{API}/farms/{farm['farm_id']}", headers=h)

    def test_all_native_inr(self, h):
        """Verify sales & investments returned to client are in INR (not converted).
        The frontend then uses convert() to display in farm.currency (INR)."""
        sales = requests.get(f"{API}/sales?farm_id={self.farm['farm_id']}", headers=h).json()
        assert len(sales) == 1
        assert sales[0]["currency"] == "INR"
        assert sales[0]["total"] == 1000

        inv = requests.get(f"{API}/investments?farm_id={self.farm['farm_id']}", headers=h).json()
        assert len(inv) == 1
        assert inv[0]["currency"] == "INR"
        assert inv[0]["amount"] == 500

    def test_multi_currency_investments_stored_natively(self, h):
        # Add a USD investment on the same farm; both should coexist with their own currencies
        r = requests.post(f"{API}/investments", json={
            "farm_id": self.farm["farm_id"], "category": "Fertilizer", "amount": 10, "currency": "USD",
        }, headers=h)
        assert r.status_code == 200
        assert r.json()["currency"] == "USD"
        inv = requests.get(f"{API}/investments?farm_id={self.farm['farm_id']}", headers=h).json()
        currencies = sorted({i["currency"] for i in inv})
        assert currencies == ["INR", "USD"]
