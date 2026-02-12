"""
Playwright scraper for Audi West Island used vehicle inventory.

The target site renders everything via JavaScript ("One Audi Falcon" platform),
so we need a headless browser. The listing page lazy-loads vehicles behind an
"Afficher plus" (Load More) button that we click repeatedly to reveal all items.
"""
import asyncio
import re
import logging
from datetime import datetime, timezone
from typing import Optional
from playwright.async_api import async_playwright, Page, Browser

from config import TARGET_URL, BASE_URL, SCRAPE_TIMEOUT, PAGE_LOAD_WAIT

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AudiWestIslandScraper:
    def __init__(self):
        self.base_url = BASE_URL
        self.inventory_url = TARGET_URL
        self.browser: Optional[Browser] = None
        self.scrape_timestamp = None

    async def scrape_inventory(self) -> list[dict]:
        self.scrape_timestamp = datetime.now(timezone.utc)
        logger.info(f"Starting inventory scrape at {self.scrape_timestamp}")

        async with async_playwright() as p:
            self.browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox"],
            )
            context = await self.browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/121.0.0.0 Safari/537.36"
                ),
            )
            page = await context.new_page()

            try:
                vehicles = await self._scrape_listing_page(page)
                logger.info(f"Scrape complete. {len(vehicles)} vehicles extracted.")
                return vehicles
            except Exception as e:
                logger.error(f"Scraping error: {e}")
                raise
            finally:
                await context.close()
                await self.browser.close()

    async def _scrape_listing_page(self, page: Page) -> list[dict]:
        logger.info(f"Navigating to {self.inventory_url}")
        await page.goto(self.inventory_url, wait_until="domcontentloaded", timeout=SCRAPE_TIMEOUT)

        try:
            await page.wait_for_selector('[class*="VehicleCard"]', timeout=PAGE_LOAD_WAIT)
        except Exception:
            logger.warning("Waiting for page to fully load...")
            await page.wait_for_timeout(10000)

        await self._load_all_vehicles(page)

        raw_vehicles = await self._extract_card_data(page)
        logger.info(f"Extracted {len(raw_vehicles)} raw vehicles from cards")

        vehicles = []
        for raw in raw_vehicles:
            parsed = self._parse_card(raw)
            if parsed.get("vin"):
                vehicles.append(parsed)
        return vehicles

    async def _load_all_vehicles(self, page: Page):
        """Keep clicking 'Load More' until no new vehicles appear."""
        prev_count = 0
        for attempt in range(30):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(1000)

            try:
                btn = page.locator(
                    'button:has-text("Afficher plus"), '
                    'button:has-text("plus de"), '
                    'button:has-text("Load More"), '
                    '[class*="LoadMore"], '
                    '[class*="load-more"]'
                )
                if await btn.count() > 0:
                    await btn.first.click()
                    await page.wait_for_timeout(2500)
                else:
                    break
            except Exception:
                break

            count = await page.evaluate("""() => {
                const seen = new Set();
                document.querySelectorAll('a[href*="vehicleId"]')
                    .forEach(a => {
                        const m = a.href.match(/vehicleId=([A-Z0-9]+)/i);
                        if (m) seen.add(m[1]);
                    });
                return seen.size;
            }""")

            logger.info(f"Load attempt {attempt + 1}: {count} vehicles")
            if count == prev_count:
                break
            prev_count = count

        logger.info(f"All vehicles loaded: {prev_count} total")

    async def _extract_card_data(self, page: Page) -> list[dict]:
        """Pull VIN, listing URL, and card text from every vehicle card on the page."""
        return await page.evaluate("""() => {
            const results = [];
            const seen = new Set();
            const links = document.querySelectorAll('a[href*="vehicleId"]');

            links.forEach(link => {
                const href = link.href;
                const vinMatch = href.match(/vehicleId=([A-Z0-9]+)/i);
                const vin = vinMatch ? vinMatch[1] : '';

                if (!vin || seen.has(vin)) return;
                seen.add(vin);

                let card = link;
                for (let i = 0; i < 15; i++) {
                    if (!card.parentElement) break;
                    card = card.parentElement;
                    const cls = card.className || '';
                    if (cls.includes('VehicleCard')) break;
                }

                results.push({
                    vin: vin,
                    listing_url: href,
                    card_text: card.innerText || '',
                });
            });
            return results;
        }""")

    def _parse_card(self, raw: dict) -> dict:
        """
        Parse card text into structured vehicle data. Expected format:

            N de stock #: U6214
            Maintenant Disponible
            2022 Audi Q3 SUV
            Technik 45 TFSI tiptronic
            Kilometrage: 71,063 km
            Prix final
            33 795,00 $
        """
        text = raw.get("card_text", "")
        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

        vehicle = {
            "vin": raw.get("vin", ""),
            "title": "",
            "price": None,
            "mileage": None,
            "mileage_unit": "km",
            "year": None,
            "make": "Audi",
            "model": "",
            "trim": "",
            "body_style": "",
            "fuel_type": "",
            "transmission": "",
            "drivetrain": "",
            "engine": "",
            "exterior_color": "",
            "interior_color": "",
            "stock_number": "",
            "listing_url": raw.get("listing_url", ""),
            "website_url": self.base_url,
            "date_scraped": self.scrape_timestamp.isoformat(),
            "status": "active",
        }

        for line in lines:
            # stock number
            stock_match = re.search(r"stock\s*#?\s*:?\s*([A-Z0-9]+)", line, re.IGNORECASE)
            if stock_match and not vehicle["stock_number"]:
                vehicle["stock_number"] = stock_match.group(1)
                continue

            # mileage
            km_match = re.search(r"[Kk]ilom[eé]trage\s*:?\s*([\d\s,.]+)\s*km", line)
            if km_match:
                raw_km = km_match.group(1).replace(",", "").replace(" ", "").replace("\u202f", "").replace(".", "")
                try:
                    vehicle["mileage"] = int(raw_km)
                except ValueError:
                    pass
                continue

            # price (French format: "33 795,00 $")
            price_match = re.search(r"([\d\s\u202f]+(?:[.,]\d{2})?)\s*\$", line)
            if price_match and not vehicle["price"]:
                price_str = re.sub(r"[\s\u202f]", "", price_match.group(1))
                price_str = re.sub(r"[.,]\d{2}$", "", price_str)
                try:
                    price = int(price_str)
                    if 1000 < price < 500000:
                        vehicle["price"] = price
                except ValueError:
                    pass
                continue

            # year + make + model line
            year_match = re.match(r"(20[1-2]\d)\s+(.+)", line)
            if year_match and not vehicle["year"]:
                vehicle["year"] = int(year_match.group(1))
                rest = year_match.group(2).strip()
                self._parse_model_line(vehicle, rest)
                vehicle["title"] = line
                continue

            # trim line (follows the year/model line)
            if (vehicle["year"] and not vehicle["trim"]
                    and line not in ["Maintenant Disponible",
                                     "Disponible dès maintenant",
                                     "Prix final",
                                     "Afficher les détails du véhicule",
                                     "Réserver un essai routier",
                                     "Demander plus d'informations",
                                     "Calculez mes paiements"]
                    and not stock_match and not km_match and not price_match
                    and not re.match(r"20[1-2]\d", line)):
                vehicle["trim"] = line
                if vehicle["title"]:
                    vehicle["title"] += " " + line

                # infer transmission
                if re.search(r"tiptronic|s.tronic|automatique", line, re.IGNORECASE):
                    vehicle["transmission"] = "Automatique"
                elif re.search(r"manuelle|manual", line, re.IGNORECASE):
                    vehicle["transmission"] = "Manuelle"

                # infer drivetrain
                if re.search(r"quattro", line, re.IGNORECASE):
                    vehicle["drivetrain"] = "AWD (quattro)"

                # infer fuel
                if re.search(r"TFSI|TSI|FSI", line):
                    vehicle["fuel_type"] = "Essence"
                elif re.search(r"TDI", line):
                    vehicle["fuel_type"] = "Diesel"
                elif re.search(r"e-tron", line, re.IGNORECASE):
                    vehicle["fuel_type"] = "Électrique"

                engine_match = re.search(r"(\d{2,3}\s*(?:TFSI|TDI|TSI|e-tron))", line)
                if engine_match:
                    vehicle["engine"] = engine_match.group(1)

        # fallback: fuel type from title
        if not vehicle["fuel_type"]:
            title = vehicle.get("title", "").lower()
            if "e-tron" in title:
                vehicle["fuel_type"] = "Électrique"
            elif "tdi" in title:
                vehicle["fuel_type"] = "Diesel"
            elif "tfsi" in title or "tsi" in title:
                vehicle["fuel_type"] = "Essence"
            else:
                vehicle["fuel_type"] = "Essence"

        if not vehicle["transmission"]:
            vehicle["transmission"] = "Automatique"

        return vehicle

    def _parse_model_line(self, vehicle: dict, text: str):
        """Extract make, model, body style from e.g. 'Audi Q3 SUV'."""
        non_audi = {
            "BMW": "BMW", "Mercedes-Benz": "Mercedes-Benz",
            "Mercedes": "Mercedes-Benz", "Porsche": "Porsche",
            "Volkswagen": "Volkswagen", "VW": "Volkswagen",
            "Toyota": "Toyota", "Honda": "Honda", "Lexus": "Lexus",
            "Acura": "Acura", "Infiniti": "Infiniti",
            "Land Rover": "Land Rover", "Range Rover": "Land Rover",
            "Jaguar": "Jaguar", "Volvo": "Volvo",
            "Genesis": "Genesis", "Hyundai": "Hyundai",
            "Kia": "Kia", "Mazda": "Mazda", "Subaru": "Subaru",
            "Ford": "Ford", "Chevrolet": "Chevrolet", "GMC": "GMC",
            "Jeep": "Jeep", "Dodge": "Dodge", "Ram": "Ram",
            "Tesla": "Tesla", "Nissan": "Nissan",
            "Mitsubishi": "Mitsubishi", "Lincoln": "Lincoln",
            "Cadillac": "Cadillac", "Buick": "Buick",
            "Chrysler": "Chrysler", "Vinfast": "Vinfast",
        }

        for key, brand in non_audi.items():
            if key.lower() in text.lower():
                vehicle["make"] = brand
                text = re.sub(re.escape(key), "", text, flags=re.IGNORECASE).strip()
                break

        if text.lower().startswith("audi"):
            text = text[4:].strip()

        # ordered longest-first so "Q5 Sportback" matches before "Q5"
        audi_models = [
            "Q8 Sportback e-tron", "Q8 e-tron", "Q4 Sportback e-tron",
            "Q4 e-tron", "Q5 Sportback", "Q3 Sportback",
            "e-tron GT", "e-tron S Sportback", "e-tron Sportback",
            "e-tron", "RS Q8", "RS Q3",
            "RS7", "RS6", "RS5", "RS4", "RS3",
            "SQ8", "SQ7", "SQ5", "SQ3",
            "S8", "S7", "S6", "S5", "S4", "S3",
            "Q8", "Q7", "Q6 e-tron", "Q5", "Q4", "Q3", "Q2",
            "A8", "A7", "A6", "A5", "A4", "A3", "A1",
            "TT RS", "TT", "R8",
        ]

        for m in audi_models:
            if m.lower() in text.lower():
                vehicle["model"] = m
                idx = text.lower().find(m.lower())
                remainder = text[idx + len(m):].strip()
                if remainder and remainder.lower() not in ["", "suv"]:
                    vehicle["body_style"] = remainder
                break

        # infer body style from model name
        if not vehicle["body_style"]:
            model_lower = vehicle["model"].lower()
            if any(q in model_lower for q in ["q2", "q3", "q4", "q5", "q6", "q7", "q8"]):
                vehicle["body_style"] = "SUV"
            elif "sportback" in model_lower:
                vehicle["body_style"] = "Sportback"
            elif "avant" in (vehicle.get("trim") or "").lower():
                vehicle["body_style"] = "Familiale"
            elif any(s in model_lower for s in ["a3", "a4", "a5", "a6", "a7", "a8",
                                                 "s3", "s4", "s5", "s6", "s7", "s8"]):
                vehicle["body_style"] = "Berline"
            elif "tt" in model_lower or "r8" in model_lower:
                vehicle["body_style"] = "Coupé"

        if "SUV" in text and not vehicle["body_style"]:
            vehicle["body_style"] = "SUV"


def run_scraper() -> list[dict]:
    return asyncio.run(AudiWestIslandScraper().scrape_inventory())


if __name__ == "__main__":
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    vehicles = run_scraper()
    print(f"\nScraped {len(vehicles)} vehicles:\n")
    for v in vehicles[:10]:
        print(f"  {v.get('title', 'N/A')}")
        print(f"    VIN: {v['vin']} | ${v.get('price', 'N/A')} | "
              f"{v.get('mileage', 'N/A')} km | {v.get('year', 'N/A')}")
        print()
