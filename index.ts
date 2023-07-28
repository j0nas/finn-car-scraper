import Playwright, { Browser, Page } from "playwright";
import fs from "fs";
import { getDigits } from "./number.js";
import pLimit from "p-limit";
import { Ad, OutputRow } from "./types.js";

let page = 1;
const limit = pLimit(10);
const timeout = 10000;
const link = `https://www.finn.no/car/used/search.html?body_type=3&body_type=2&page=${page}&body_type=5&car_equipment=23&driving_range_from=250&fuel=4&mileage_to=100000&price_to=310000&sales_form=1&sort=PRICE_ASC`;
const adsLinkSelector = "a.sf-search-ad-link";

const initPageWithNewContext = async (browser: Browser, link: string) => {
  const context = await browser.newContext();
  context.setDefaultNavigationTimeout(timeout);
  context.setDefaultTimeout(timeout);
  const page = await context.newPage();
  await page.goto(link);
  return { page, context };
};

const getAds = async (page: Page) => {
  // Get title and href of all ads
  await page.waitForSelector(adsLinkSelector);

  const ads: Ad[] = [];
  let hasNextPage = false;

  do {
    const items = await page
      .locator("article.sf-search-ad", {
        has: page.locator(adsLinkSelector),
        hasNot: page.locator("span:has-text('Solgt')"),
      })
      .all();
    for await (const itemContainer of items) {
      const items = itemContainer.locator(adsLinkSelector);
      if ((await items.count()) > 0) {
        const item = items.first();
        if (!item || !(await item.isVisible())) {
          continue;
        }

        const [text, link] = await Promise.all([item.textContent(), item.getAttribute("href")]);
        if (text && link && !ads.find((e) => e.link === link)) {
          ads.push({ text, link });
        }
      }
    }
    const nextPageLocator = page.getByLabel("Neste resultatside");
    hasNextPage = await nextPageLocator.isVisible();
    if (hasNextPage) {
      await nextPageLocator.click();
    }
  } while (hasNextPage);

  return ads;
};

const getAdDetails = async (browser: Browser, ad: Ad) => {
  const { page, context } = await initPageWithNewContext(browser, ad.link);
  const year = getDigits(await page.locator('div:has-text("Modellår") + div.u-strong').innerText());
  const km = getDigits(await page.locator('div:has-text("Kilometer") + div.u-strong').innerText());
  const price = getDigits(
    await page.getByTestId("price").or(page.locator('span:has-text("Totalpris") + span.u-t3')).innerText()
  );
  const wltp = getDigits(await page.locator('dt:has-text("Rekkevidde (WLTP)") + dd').innerText());
  const model = getDigits(await page.locator("h1.u-t2.u-word-break").first().innerText());

  await context.close();

  return { title: ad.text, url: ad.link, model, year, km, price, wltp };
};

export default (async () => {
  const browser = await Playwright.chromium.launch({ headless: true, timeout });
  const { page, context } = await initPageWithNewContext(browser, link);
  const ads = await getAds(page);
  await context.close();
  const header = ["id", "title", "url", "model", "year", "km", "price", "wltp"];

  // Get details for each ad
  const rows: OutputRow[] = await Promise.all(
    ads.map((ad, index) =>
      limit(() => {
        console.log(`${index + 1}/${ads.length}`);
        return getAdDetails(browser, ad);
      })
    )
  );

  let content = header.join(",") + "\n";
  let counter = 0;
  for await (const { title, url, model, year, km, price, wltp } of rows) {
    content +=
      [String(counter++), title, url, model, year, km, price, wltp]
        .map((e) => e.replaceAll('"', "").replaceAll(",", ""))
        .join(",") + "\n";
  }

  fs.writeFileSync("data.csv", content);
  process.exit(0);
})();
