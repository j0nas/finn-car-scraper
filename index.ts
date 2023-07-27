import Playwright from "playwright";
import fs from "fs";

const link =
  "https://www.finn.no/car/used/search.html?body_type=3&body_type=2&body_type=5&car_equipment=23&driving_range_from=250&fuel=4&mileage_to=100000&price_to=310000&sales_form=1&sort=PRICE_ASC&stored-id=65182835";

const adsSelector = ".sf-search-ad-link";
// const itemsSelector = (page) => Array.from(page.querySelectorAll(adsSelector));

(async () => {
  const browser = await Playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(link);

  // Get title and href of all ads
  await page.waitForSelector(adsSelector);
  const items = await page.locator(adsSelector).all();
  const ads: { text: string; link: string }[] = [];
  for (const item of items) {
    const [text, link] = await Promise.all([item.textContent(), item.getAttribute("href")]);
    if (text && link) {
      ads.push({ text, link });
    }
  }

  const header = ["title", "url", "model", "year", "km", "price", "wltp"];

  // Get details for each ad
  const rows: {
    title: string;
    url: string;
    model: string;
    year: string;
    km: string;
    price: string;
    wltp: string;
  }[] = [];

  let index = 0;
  for await (const ad of ads) {
    console.log(`${++index}/${ads.length}`);
    await page.goto(ad.link);
    const year = await page.locator('div:has-text("Modellår") + div.u-strong').innerText();
    const km = await page.locator('div:has-text("Kilometer") + div.u-strong').innerText();
    const priceText = await page
      .getByTestId("price")
      .or(page.locator('span:has-text("Totalpris") + span.u-t3'))
      .innerText();
    const price = priceText.match(/\d+/g)?.join("") || "";
    const wltp = await page.locator('dt:has-text("Rekkevidde (WLTP)") + dd').innerText();
    const model = await page.locator("h1.u-t2.u-word-break").first().innerText();

    rows.push({ title: ad.text, url: ad.link, model, year, km, price, wltp });
  }

  let content = header.join(",") + "\n";
  for await (const { title, url, model, year, km, price, wltp } of rows) {
    content +=
      [title, url, model, year, km, price, wltp].map((e) => e.replaceAll('"', "").replaceAll(",", "")).join(",") + "\n";
  }

  fs.writeFileSync("data.csv", content);
  process.exit(0);
})();
