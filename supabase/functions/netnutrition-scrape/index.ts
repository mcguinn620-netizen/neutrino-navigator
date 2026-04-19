import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "http://netnutrition.bsu.edu/NetNutrition/1";

interface SessionState {
  cookies: string[];
}

/** Collect cookies from a response and merge into existing list. */
function collectCookies(res: Response, cookies: string[]): string[] {
  const updated = [...cookies];
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const name = c.split("=")[0];
    const idx = updated.findIndex((x) => x.startsWith(name + "="));
    const value = c.split(";")[0];
    if (idx >= 0) {
      updated[idx] = value;
    } else {
      updated.push(value);
    }
  }

  // Fallback for environments without getSetCookie
  if (setCookies.length === 0) {
    const raw = res.headers.get("set-cookie");
    if (raw) {
      for (const part of raw.split(/,(?=\s*\w+=)/)) {
        const value = part.split(";")[0].trim();
        const name = value.split("=")[0];
        const idx = updated.findIndex((x) => x.startsWith(name + "="));
        if (idx >= 0) {
          updated[idx] = value;
        } else {
          updated.push(value);
        }
      }
    }
  }

  return updated;
}

/** Establish a session by manually following redirects to capture all cookies. */
async function initSession(): Promise<SessionState> {
  let cookies: string[] = [];
  let url: string = BASE_URL;

  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Cookie": cookies.join("; "),
      },
    });

    cookies = collectCookies(res, cookies);
    await res.text();

    const location = res.headers.get("location");
    if (location && res.status >= 300 && res.status < 400) {
      url = new URL(location, url).href;
      console.log(`  Redirect ${res.status} → ${url}`);
    } else {
      break;
    }
  }

  const hasCbord = cookies.some((c) => c.startsWith("CBORD.netnutrition2="));
  if (!hasCbord) {
    cookies.push("CBORD.netnutrition2=NNexternalID=1");
  }

  console.log(
    "Session cookies:",
    cookies.map((c) => c.split("=")[0]).join(", "),
  );

  return { cookies };
}

/** POST to a NetNutrition endpoint maintaining session cookies. */
async function postWithSession(
  session: SessionState,
  path: string,
  body: Record<string, string | number>,
): Promise<string> {
  const formData = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    formData.append(k, String(v));
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Cookie": session.cookies.join("; "),
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "*/*",
      "Referer": BASE_URL,
      "Origin": "http://netnutrition.bsu.edu",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
      "Accept-Language": "en-US,en;q=0.9",
      "Connection": "keep-alive",
    },
    body: formData.toString(),
  });

  const text = await res.text();
  console.log(
    `  POST ${path} → status ${res.status}, length ${text.length}, starts: ${
      text.substring(0, 120)
    }`,
  );

  session.cookies = collectCookies(res, session.cookies);
  return text;
}

/** Check if a response is a Start-up Error page (session lost). */
function isStartupError(text: string): boolean {
  return text.includes("NetNutrition Start-up Error") ||
    text.includes("ANA_border");
}

/** Extract HTML from a specific panel in the JSON response. */
function extractPanelHtml(responseText: string, panelId: string): string {
  try {
    const data = JSON.parse(responseText);
    if (data.success && Array.isArray(data.panels)) {
      const panel = data.panels.find(
        (p: { id: string; html: string }) => p.id === panelId,
      );
      return panel?.html ?? "";
    }
  } catch {
    // Not JSON — return raw for regex parsing
  }

  return responseText;
}

// Known dining halls with their sidebar unitOids (verified from browser captures)
const KNOWN_HALLS = [
  { name: "The Atrium", unitOid: 1 },
  { name: "Atrium Café", unitOid: 10 },
  { name: "Noyer", unitOid: 14 },
  { name: "Student Center Tally Food Court", unitOid: 16 },
  { name: "North Dining", unitOid: 21 },
  // Woodworth Commons sits behind a units-list (unit oid 38). Its meal-period
  // child units (Lunch / Dinner) are exposed via SelectUnitFromUnitsList and
  // typically begin around unit oid 40. See scrapeSingleHall's Woodworth probe.
  { name: "Woodworth Commons", unitOid: 38 },
  { name: "Bookmark Cafe", unitOid: 33 },
  { name: "Tom John Food Shop", unitOid: 35 },
];

/** Parse dining halls from the sidebar HTML in the initial page. */
function parseHallsFromPage(html: string): { name: string; unitOid: number }[] {
  const halls: { name: string; unitOid: number }[] = [];
  const regex = /sideBarSelectUnit\((\d+)\)[^>]*>([^<]+)/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const unitOid = parseInt(match[1]);
    const name = match[2].trim();
    if (name) {
      halls.push({ unitOid, name });
    }
  }

  return halls;
}

/** Parse station links from childUnitsPanel HTML. */
function parseStations(html: string): { name: string; unitOid: number }[] {
  const stations: { name: string; unitOid: number }[] = [];
  const regex = /childUnitsSelectUnit\((\d+)\)[^>]*>([^<]+)/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const unitOid = parseInt(match[1]);
    const name = match[2].trim();
    if (name) {
      stations.push({ unitOid, name });
    }
  }

  return stations;
}

/**
 * Parse units-list links — used by halls like Woodworth Commons that expose
 * meal periods (Lunch / Dinner) via a units-list panel rather than the usual
 * childUnits panel. Triggered by `unitsListSelectUnit(N)` JS handlers.
 */
function parseUnitsList(html: string): { name: string; unitOid: number }[] {
  const units: { name: string; unitOid: number }[] = [];
  const seen = new Set<number>();
  const regexes = [
    /unitsListSelectUnit\((\d+)\)[^>]*>([^<]+)/gi,
    /selectUnitFromUnitsList\((\d+)\)[^>]*>([^<]+)/gi,
  ];
  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const unitOid = parseInt(match[1]);
      const name = match[2].replace(/&nbsp;/g, " ").trim();
      if (name && !seen.has(unitOid)) {
        seen.add(unitOid);
        units.push({ unitOid, name });
      }
    }
  }
  return units;
}

/** Parse menu links (Daily Menu style) from a panel. */
function parseMenus(html: string): { name: string; menuOid: number }[] {
  const menus: { name: string; menuOid: number }[] = [];
  const seen = new Set<number>();
  // Common NetNutrition triggers for menu selection
  const regexes = [
    /selectMenu\((\d+)\)[^>]*>([^<]+)/gi,
    /menuListSelectMenu\((\d+)\)[^>]*>([^<]+)/gi,
    /SelectMenu\((\d+)\)[^>]*>([^<]+)/gi,
  ];
  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const menuOid = parseInt(match[1]);
      const name = match[2].replace(/&nbsp;/g, " ").trim();
      if (name && !seen.has(menuOid)) {
        seen.add(menuOid);
        menus.push({ menuOid, name });
      }
    }
  }
  return menus;
}

interface ParsedFoodItem {
  name: string;
  detailOid: number;
  allergens: string[];
  dietaryFlags: string[];
  servingSize: string;
}

interface ParsedCategory {
  name: string;
  items: ParsedFoodItem[];
}

/** Parse food items from raw item rows when categories are not present. */
function parseFoodItems(html: string): ParsedFoodItem[] {
  const items: ParsedFoodItem[] = [];

  const rowRegex =
    /<tr[^>]*class='cbo_nn_item(?:Primary|Alternate)Row'[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    const oidMatch = row.match(
      /(?:getItemNutritionLabel|ShowItemNutritionLabel)\((\d+)\)/,
    ) ?? row.match(/id=['"]cbm(\d+)['"]/i);
    if (!oidMatch) continue;
    const detailOid = parseInt(oidMatch[1]);

    const hoverMatch = row.match(
      /class=['"]cbo_nn_itemHover['"]>([\s\S]*?)<\/td>/i,
    );
    if (!hoverMatch) continue;

    const hoverContent = hoverMatch[1];
    const nameMatch = hoverContent.match(/^([^<]+)/);
    const name = nameMatch ? nameMatch[1].trim() : "";
    if (!name) continue;

    const allergens: string[] = [];
    const dietaryFlags: string[] = [];
    const imgRegex = /title=['"]([^'"]+)['"]/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(hoverContent)) !== null) {
      const title = imgMatch[1].trim();
      const lower = title.toLowerCase();
      if (lower === "vegan" || lower === "vegetarian") {
        dietaryFlags.push(title);
      } else {
        allergens.push(title);
      }
    }

    const afterHover = row.substring(
      (hoverMatch.index ?? 0) + hoverMatch[0].length,
    );
    const servingMatch = afterHover.match(/<td[^>]*>([^<]*)<\/td>/i);
    const servingSize = servingMatch ? servingMatch[1].trim() : "";

    items.push({ name, detailOid, allergens, dietaryFlags, servingSize });
  }

  return items;
}

/** Parse grouped categories from itemPanel HTML using cbo_nn_itemGroupRow as the category key. */
function parseCategoriesFromItemPanel(html: string): ParsedCategory[] {
  const categories: ParsedCategory[] = [];

  // Scan rows directly from the full panel HTML (no strict <table> wrapper requirement).
  const rowRegex = /<tr\b[\s\S]*?<\/tr>/gi;
  let rowMatch;
  let currentCategory: ParsedCategory | null = null;
  let sawAnyGroupRow = false;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[0];

    // Group/category header row — class can be on <tr> or inner <td>.
    const groupMatch = rowHtml.match(
      /class=['"][^'"]*cbo_nn_itemGroupRow[^'"]*['"][^>]*>([\s\S]*?)<\/(?:td|tr)>/i,
    );
    if (groupMatch) {
      sawAnyGroupRow = true;
      const categoryName = groupMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (categoryName) {
        currentCategory = { name: categoryName, items: [] };
        categories.push(currentCategory);
      }
      continue;
    }

    const parsedItems = parseFoodItems(rowHtml);
    if (parsedItems.length === 0) continue;

    if (!currentCategory) {
      currentCategory = { name: "All Items", items: [] };
      categories.push(currentCategory);
    }

    for (const item of parsedItems) {
      currentCategory.items.push(item);
    }
  }

  // If we never saw a real category header row, signal "no grouping" so caller can fall back.
  if (!sawAnyGroupRow) return [];

  return categories.filter((c) => c.items.length > 0);
}

/** Parse nutrition facts from the nutrition label HTML. */
function parseNutrients(html: string): Record<string, string> {
  const nutrients: Record<string, string> = {};

  const servingMatch = html.match(/Serving Size:(?:&nbsp;|\s)*([^<]+)/i);
  if (servingMatch) {
    nutrients["Serving Size"] = servingMatch[1]
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  const calMatch = html.match(
    />Calories<\/span>(?:&nbsp;|\s)*<span[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>(?:&nbsp;|\s)*([^<]+)/i,
  );
  if (calMatch) {
    nutrients["Calories"] = calMatch[1].replace(/&nbsp;/g, "").trim();
  }

  const calFatMatch = html.match(
    /Calories from Fat(?:&nbsp;|\s)*<span[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>(?:&nbsp;|\s)*([^<]+)/i,
  );
  if (calFatMatch) {
    nutrients["Calories from Fat"] = calFatMatch[1]
      .replace(/&nbsp;/g, "")
      .trim();
  }

  const mainRegex =
    /font-weight:\s*bold;?\s*'>\s*([^<]+)<\/span><\/td><td><span[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>(?:&nbsp;|\s)*([^<]+)/gi;
  let mainMatch;
  while ((mainMatch = mainRegex.exec(html)) !== null) {
    const label = mainMatch[1].trim();
    const value = mainMatch[2].replace(/&nbsp;/g, "").trim();
    if (label && value && label !== "Calories") {
      nutrients[label] = value;
    }
  }

  const subRegex =
    /font-weight:\s*normal;?\s*'>\s*([^<]+)<\/span><\/td><td><span[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>(?:&nbsp;|\s)*([^<]+)/gi;
  let subMatch;
  while ((subMatch = subRegex.exec(html)) !== null) {
    const label = subMatch[1].trim();
    const value = subMatch[2].replace(/&nbsp;/g, "").trim();
    if (label && value) {
      nutrients[label] = value;
    }
  }

  const secRegex =
    /class=['"]cbo_nn_SecondaryNutrientLabel['"]>\s*([^<]+)<\/td>\s*<td[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>\s*([^<]+)/gi;
  let secMatch;
  while ((secMatch = secRegex.exec(html)) !== null) {
    const label = secMatch[1].trim();
    const value = secMatch[2].trim();
    if (label && value) {
      nutrients[label] = value;
    }
  }

  const ingredientsMatch = html.match(
    /class=['"]cbo_nn_LabelIngredients['"]>\s*([\s\S]*?)<\/span>/i,
  );
  if (ingredientsMatch) {
    nutrients["Ingredients"] = ingredientsMatch[1]
      .replace(/&nbsp;/g, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  return nutrients;
}

// deno-lint-ignore no-explicit-any
type SupabaseAny = any;

/** Upsert a category into the database. */
async function upsertCategory(
  supabase: SupabaseAny,
  stationId: string,
  categoryName: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("menu_categories")
    .upsert(
      {
        station_id: stationId,
        name: categoryName,
      },
      { onConflict: "station_id,name" },
    )
    .select("id")
    .single();

  if (error) {
    console.error(`    Error upserting category ${categoryName}:`, error);
    return null;
  }

  return (data?.id as string | undefined) ?? null;
}

/** Fetch and parse nutrition facts for a single item. Returns {} on failure. */
async function fetchItemNutrients(
  session: SessionState,
  detailOid: number,
): Promise<Record<string, string>> {
  try {
    const response = await postWithSession(
      session,
      "/NutritionDetail/ShowItemNutritionLabel",
      { detailOid },
    );
    if (isStartupError(response)) return {};
    const labelHtml = extractPanelHtml(response, "itemNutritionLabelPanel") ||
      response;
    return parseNutrients(labelHtml);
  } catch (e) {
    console.error(`    Nutrition fetch failed for ${detailOid}:`, e);
    return {};
  }
}

/** Upsert a food item into the database. */
async function upsertItem(
  supabase: SupabaseAny,
  session: SessionState,
  stationId: string,
  categoryId: string | null,
  item: ParsedFoodItem,
): Promise<void> {
  const nutrients = await fetchItemNutrients(session, item.detailOid);

  const { error: itemError } = await supabase.from("food_items").upsert(
    {
      station_id: stationId,
      category_id: categoryId,
      name: item.name,
      detail_oid: item.detailOid,
      serving_size: item.servingSize || null,
      allergens: item.allergens,
      dietary_flags: item.dietaryFlags,
      nutrients,
    },
    { onConflict: "detail_oid" },
  );

  if (itemError) {
    console.error(`    Error upserting ${item.name}:`, itemError);
  }
}

/** Process items from an itemPanel, using cbo_nn_itemGroupRow as category key when present. */
async function processItemPanel(
  supabase: SupabaseAny,
  session: SessionState,
  stationId: string,
  itemPanelHtml: string,
): Promise<number> {
  // Debug: log a snippet around the first group/course marker to verify class names.
  const probeIdx = itemPanelHtml.search(/itemGroupRow|courseItem|cbo_nn_item/i);
  if (probeIdx >= 0) {
    const snippet = itemPanelHtml.substring(
      Math.max(0, probeIdx - 80),
      probeIdx + 240,
    );
    console.log(`    HTML probe @${probeIdx}: ${snippet.replace(/\s+/g, " ")}`);
  } else {
    console.log(`    HTML probe: no itemGroupRow/courseItem/cbo_nn_item match`);
  }

  const categories = parseCategoriesFromItemPanel(itemPanelHtml);

  if (categories.length > 0) {
    console.log(`    Found ${categories.length} categories`);
    let total = 0;

    for (const category of categories) {
      console.log(
        `      Category: ${category.name} (${category.items.length} items)`,
      );
      const categoryId = await upsertCategory(
        supabase,
        stationId,
        category.name,
      );

      for (const item of category.items) {
        await upsertItem(supabase, session, stationId, categoryId, item);
        total++;
      }
    }

    return total;
  }

  const foodItems = parseFoodItems(itemPanelHtml);
  console.log(`    Found ${foodItems.length} ungrouped food items`);

  for (const item of foodItems) {
    await upsertItem(supabase, session, stationId, null, item);
  }

  return foodItems.length;
}

/** Try to fetch items from a "Daily Menu"-style station that lists menus rather than items. */
async function processDailyMenuStation(
  supabase: SupabaseAny,
  session: SessionState,
  stationId: string,
  childResponseHtml: string,
): Promise<number> {
  // Diagnostic: dump panel ids + samples so we can see exactly what NetNutrition returns.
  try {
    const data = JSON.parse(childResponseHtml);
    if (Array.isArray(data.panels)) {
      console.log(
        `    [daily-menu probe] panels: ${data.panels.map((p: { id: string; html?: string }) => `${p.id}(${p.html?.length ?? 0})`).join(", ")}`,
      );
      for (const p of data.panels) {
        if (p.html && p.html.length > 100) {
          console.log(
            `    [daily-menu probe] panel ${p.id} sample: ${p.html.substring(0, 1500).replace(/\s+/g, " ")}`,
          );
        }
      }
    } else {
      console.log(
        `    [daily-menu probe] non-panels JSON keys: ${Object.keys(data).join(",")}`,
      );
    }
  } catch {
    console.log(
      `    [daily-menu probe] non-JSON response, first 1500 chars: ${childResponseHtml.substring(0, 1500).replace(/\s+/g, " ")}`,
    );
  }

  // NetNutrition's actual panel for daily menus is `menuPanel`, which contains
  // <a class='cbo_nn_menuLink' onclick="menuListSelectMenu(NNN)">Lunch</a>
  // grouped by date row.
  const candidates = [
    extractPanelHtml(childResponseHtml, "menuPanel"),
    extractPanelHtml(childResponseHtml, "MenuList"),
    extractPanelHtml(childResponseHtml, "menuListPanel"),
    extractPanelHtml(childResponseHtml, "itemPanel"),
    extractPanelHtml(childResponseHtml, "selectedUnitPanel"),
    childResponseHtml,
  ];
  let menus: { name: string; menuOid: number; dateLabel?: string }[] = [];
  let panelHtml = "";
  for (const html of candidates) {
    if (!html) continue;
    const found = parseMenusWithDates(html);
    if (found.length > 0) {
      menus = found;
      panelHtml = html;
      break;
    }
  }

  if (menus.length === 0) {
    console.log(`    No daily menus found for station`);
    return 0;
  }

  console.log(
    `    Found ${menus.length} daily menus in panel (${panelHtml.length} chars), drilling in...`,
  );
  let total = 0;
  for (const menu of menus) {
    const menuLabel = menu.dateLabel
      ? `${menu.dateLabel} — ${menu.name}`
      : menu.name;
    console.log(`      Menu: ${menuLabel} (${menu.menuOid})`);
    const menuRes = await postWithRetry(session, "/Menu/SelectMenu", {
      menuOid: menu.menuOid,
    });
    if (isStartupError(menuRes)) continue;

    const menuItemHtml = extractPanelHtml(menuRes, "itemPanel");
    if (menuItemHtml && menuItemHtml.includes("cbo_nn_itemHover")) {
      total += await processItemPanelWithCategoryPrefix(
        supabase,
        session,
        stationId,
        menuItemHtml,
        menuLabel,
      );
    } else {
      console.log(
        `        SelectMenu(${menu.menuOid}) returned no items (panel length ${menuItemHtml?.length ?? 0})`,
      );
    }
  }
  return total;
}

/** Parse menu links along with their nearest preceding date label.
 * Robust to either <tr class='cbo_nn_menu(Primary|Alternate)Row'> structure
 * or plain HTML where date headers and menu links are siblings. */
function parseMenusWithDates(
  html: string,
): { name: string; menuOid: number; dateLabel?: string }[] {
  const out: { name: string; menuOid: number; dateLabel?: string }[] = [];
  const seen = new Set<number>();
  const cleanText = (value: string) => value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const datePatterns = [
    /((?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,?\s*[A-Z][a-z]+\s+\d{1,2},?\s*\d{4})/i,
    /([A-Z][a-z]+\s+\d{1,2},?\s*\d{4})/i,
    /(Today|Tomorrow)/i,
  ];
  const extractDateLabel = (value: string): string | undefined => {
    const text = cleanText(value);
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) return match[1].replace(/\s+/g, " ").trim();
    }
    return undefined;
  };

  // Pass 1 — table-row style (preferred when present)
  const rowRegex =
    /<tr[^>]*class=['"][^'"]*cbo_nn_menu(?:Primary|Alternate)Row[^'"]*['"][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const dateLabel = extractDateLabel(row);

    const linkRegex =
      /(?:menuListSelectMenu|selectMenu|SelectMenu)\((\d+)\)[^>]*>\s*([^<]+?)\s*</gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(row)) !== null) {
      const menuOid = parseInt(linkMatch[1]);
      const name = cleanText(linkMatch[2]);
      if (name && !seen.has(menuOid)) {
        seen.add(menuOid);
        out.push({ menuOid, name, dateLabel });
      }
    }
  }

  if (out.length > 0) return out;

  // Pass 2 — sequential scan: pair each selectMenu(N) link with the nearest
  // preceding date label found in the HTML. Works for div/anchor layouts.
  const dateContainerRegex =
    /<(?:tr|div|li|span|td|a)[^>]*(?:class|id)=['"][^'"]*(?:date|day|menuDate|cbo_nn_menu(?:Primary|Alternate)Row)[^'"]*['"][^>]*>([\s\S]*?)<\/(?:tr|div|li|span|td|a)>/gi;
  const dates: { idx: number; label: string }[] = [];
  let dm;
  while ((dm = dateContainerRegex.exec(html)) !== null) {
    const label = extractDateLabel(dm[1]);
    if (label) dates.push({ idx: dm.index, label });
  }

  for (const pattern of datePatterns) {
    const globalPattern = new RegExp(pattern.source, "gi");
    let textMatch;
    while ((textMatch = globalPattern.exec(html)) !== null) {
      const label = cleanText(textMatch[1]);
      if (label) dates.push({ idx: textMatch.index, label });
    }
  }

  dates.sort((a, b) => a.idx - b.idx);

  const linkRegex =
    /(?:menuListSelectMenu|selectMenu|SelectMenu)\((\d+)\)[^>]*>\s*([^<]+?)\s*</gi;
  let lm;
  while ((lm = linkRegex.exec(html)) !== null) {
    const oid = parseInt(lm[1]);
    const name = cleanText(lm[2]);
    if (!name || seen.has(oid)) continue;
    seen.add(oid);

    // Find nearest preceding date label
    let dateLabel: string | undefined;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i].idx < lm.index) {
        dateLabel = dates[i].label;
        break;
      }
    }
    out.push({ menuOid: oid, name, dateLabel });
  }

  return out;
}

/** Like processItemPanel but prefixes each discovered category name with a label. */
async function processItemPanelWithCategoryPrefix(
  supabase: SupabaseAny,
  session: SessionState,
  stationId: string,
  itemPanelHtml: string,
  prefix: string,
): Promise<number> {
  const categories = parseCategoriesFromItemPanel(itemPanelHtml);

  if (categories.length > 0) {
    let total = 0;
    for (const category of categories) {
      const labeledName = `${prefix} • ${category.name}`;
      console.log(
        `      Category: ${labeledName} (${category.items.length} items)`,
      );
      const categoryId = await upsertCategory(supabase, stationId, labeledName);
      for (const item of category.items) {
        await upsertItem(supabase, session, stationId, categoryId, item);
        total++;
      }
    }
    return total;
  }

  const items = parseFoodItems(itemPanelHtml);
  if (items.length === 0) return 0;
  const categoryId = await upsertCategory(supabase, stationId, prefix);
  for (const item of items) {
    await upsertItem(supabase, session, stationId, categoryId, item);
  }
  return items.length;
}

/** Process a hall that exposes a top-level menuPanel (dated meals).
 * Strategy: create one station per unique meal name (e.g. "Lunch", "Dinner",
 * or "Daily Menu" if there's only one), and inside each station store
 * categories prefixed by the date so users can browse per-day. */
async function processHallMenuList(
  supabase: SupabaseAny,
  session: SessionState,
  hallId: string,
  hallUnitOid: number,
  menus: { name: string; menuOid: number; dateLabel?: string }[],
): Promise<number> {
  const byMeal = new Map<string, typeof menus>();
  for (const m of menus) {
    const key = m.name || "Daily Menu";
    if (!byMeal.has(key)) byMeal.set(key, []);
    byMeal.get(key)!.push(m);
  }

  let total = 0;
  let mealIndex = 0;
  for (const [mealName, mealMenus] of byMeal) {
    mealIndex++;
    const syntheticOid = hallUnitOid * 1000 + mealIndex;

    const { data: stationData, error: stationError } = await supabase
      .from("stations")
      .upsert(
        { dining_hall_id: hallId, name: mealName, unit_oid: syntheticOid },
        { onConflict: "unit_oid" },
      )
      .select("id")
      .single();

    if (stationError || !stationData) {
      console.error(`  Error creating meal station ${mealName}:`, stationError);
      continue;
    }

    console.log(
      `  Meal station "${mealName}" (${mealMenus.length} dates)`,
    );

    for (const menu of mealMenus) {
      const dateLabel = menu.dateLabel || "Today";
      console.log(`    ${dateLabel} (menuOid ${menu.menuOid})`);

      const menuRes = await postWithRetry(session, "/Menu/SelectMenu", {
        menuOid: menu.menuOid,
      });
      if (isStartupError(menuRes)) continue;

      const itemHtml = extractPanelHtml(menuRes, "itemPanel");
      if (!itemHtml || !itemHtml.includes("cbo_nn_itemHover")) {
        console.log(`      no items returned (panel ${itemHtml?.length ?? 0})`);
        continue;
      }

      total += await processItemPanelWithCategoryPrefix(
        supabase,
        session,
        stationData.id,
        itemHtml,
        dateLabel,
      );
    }
  }
  return total;
}

/** POST with session recovery — re-inits session if Start-up Error is returned. */
async function postWithRetry(
  session: SessionState,
  path: string,
  body: Record<string, string | number>,
  maxRetries = 2,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const text = await postWithSession(session, path, body);
    if (!isStartupError(text)) {
      return text;
    }

    console.log(
      `  Start-up Error detected (attempt ${attempt + 1}), re-initializing session...`,
    );
    const newSession = await initSession();
    session.cookies = newSession.cookies;
  }

  return await postWithSession(session, path, body);
}

interface ScrapeRequestBody {
  hallUnitOid?: number;
  wipe?: boolean;
}

interface HallScrapeResult {
  hallName: string;
  itemsCount: number;
}

interface InvokedHallResult extends HallScrapeResult {
  success: boolean;
  error?: string;
}

async function readRequestBody(req: Request): Promise<ScrapeRequestBody> {
  if (req.method !== "POST") return {};
  const raw = await req.text();
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw) as ScrapeRequestBody;
  } catch {
    return {};
  }
}

async function fetchInitialPageHtml(session: SessionState): Promise<string> {
  const headers = {
    "Cookie": session.cookies.join("; "),
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  const initPageRes = await fetch(BASE_URL, { headers });
  session.cookies = collectCookies(initPageRes, session.cookies);
  const initPageHtml = await initPageRes.text();
  console.log(`Initial page loaded, length: ${initPageHtml.length}`);

  if (!isStartupError(initPageHtml)) return initPageHtml;

  console.log("Initial page returned Start-up Error, re-initializing session...");
  const newSession = await initSession();
  session.cookies = newSession.cookies;

  const retryRes = await fetch(BASE_URL, {
    headers: {
      ...headers,
      "Cookie": session.cookies.join("; "),
    },
  });

  session.cookies = collectCookies(retryRes, session.cookies);
  const retryHtml = await retryRes.text();
  console.log(`Retry page loaded, length: ${retryHtml.length}`);
  return retryHtml;
}

async function discoverDiningHalls(
  session: SessionState,
): Promise<{ name: string; unitOid: number }[]> {
  const initPageHtml = await fetchInitialPageHtml(session);
  let discoveredHalls = parseHallsFromPage(initPageHtml);
  console.log(
    `Discovered ${discoveredHalls.length} dining halls from page`,
  );

  if (discoveredHalls.length === 0) {
    console.log(
      "Dynamic discovery failed, using known hall list as fallback",
    );
    discoveredHalls = KNOWN_HALLS;
  }

  return discoveredHalls;
}

async function cleanupHallData(
  supabase: SupabaseAny,
  hallId: string,
  hallName: string,
): Promise<void> {
  const { data: existingStations, error: stationReadError } = await supabase
    .from("stations")
    .select("id")
    .eq("dining_hall_id", hallId);

  if (stationReadError) {
    throw new Error(
      `Failed reading existing stations for ${hallName}: ${stationReadError.message}`,
    );
  }

  const stationIds = ((existingStations as { id: string }[] | null) ?? []).map((s) => s.id);
  if (stationIds.length === 0) return;

  console.log(`  Wiping ${stationIds.length} existing stations for ${hallName}`);

  const { error: itemDeleteError } = await supabase
    .from("food_items")
    .delete()
    .in("station_id", stationIds);
  if (itemDeleteError) {
    throw new Error(
      `Failed deleting food items for ${hallName}: ${itemDeleteError.message}`,
    );
  }

  const { error: categoryDeleteError } = await supabase
    .from("menu_categories")
    .delete()
    .in("station_id", stationIds);
  if (categoryDeleteError) {
    throw new Error(
      `Failed deleting categories for ${hallName}: ${categoryDeleteError.message}`,
    );
  }

  const { error: stationDeleteError } = await supabase
    .from("stations")
    .delete()
    .eq("dining_hall_id", hallId);
  if (stationDeleteError) {
    throw new Error(
      `Failed deleting stations for ${hallName}: ${stationDeleteError.message}`,
    );
  }
}

async function scrapeSingleHall(
  supabase: SupabaseAny,
  hall: { name: string; unitOid: number },
  wipe: boolean,
): Promise<HallScrapeResult> {
  console.log(`\n=== Scraping: ${hall.name} (unitOid: ${hall.unitOid}) ===`);

  const { data: hallData, error: hallError } = await supabase
    .from("dining_halls")
    .upsert(
      { name: hall.name, unit_oid: hall.unitOid },
      { onConflict: "unit_oid" },
    )
    .select("id")
    .single();

  if (hallError || !hallData) {
    throw new Error(`Error upserting hall ${hall.name}: ${hallError?.message ?? "Unknown error"}`);
  }

  if (wipe) {
    await cleanupHallData(supabase, hallData.id, hall.name);
  }

  const session = await initSession();
  console.log("Session established, cookies:", session.cookies.length);
  await fetchInitialPageHtml(session);

  let totalItems = 0;
  const sidebarResponse = await postWithRetry(
    session,
    "/Unit/SelectUnitFromSideBar",
    { unitOid: hall.unitOid },
  );

  if (isStartupError(sidebarResponse)) {
    throw new Error(`Persistent Start-up Error while opening ${hall.name}`);
  }

  const childUnitsHtml = extractPanelHtml(sidebarResponse, "childUnitsPanel");
  const itemPanelHtml = extractPanelHtml(sidebarResponse, "itemPanel");
  const menuPanelHtml = extractPanelHtml(sidebarResponse, "menuPanel");

  try {
    const parsed = JSON.parse(sidebarResponse);
    if (Array.isArray(parsed.panels)) {
      const summary = parsed.panels
        .map((p: { id: string; html?: string }) => `${p.id}=${p.html?.length ?? 0}`)
        .join(", ");
      console.log(`  [panels] ${hall.name}: ${summary}`);

      // DEBUG: dump full HTML for Woodworth so we can see Lunch/Dinner markup
      if (hall.name.toLowerCase().includes("woodworth")) {
        for (const p of parsed.panels as { id: string; html?: string }[]) {
          const h = (p.html ?? "").replace(/\s+/g, " ").trim();
          if (!h) continue;
          const chunks = Math.ceil(h.length / 1500);
          for (let i = 0; i < chunks; i++) {
            console.log(
              `  [WOODWORTH-DEBUG] panel=${p.id} part=${i + 1}/${chunks}: ${h.substring(i * 1500, (i + 1) * 1500)}`,
            );
          }
        }
      }
    }
  } catch {
    console.log(`  [panels] ${hall.name}: non-JSON sidebar response`);
    if (hall.name.toLowerCase().includes("woodworth")) {
      const h = sidebarResponse.replace(/\s+/g, " ").trim();
      const chunks = Math.ceil(h.length / 1500);
      for (let i = 0; i < chunks; i++) {
        console.log(
          `  [WOODWORTH-RAW-SIDEBAR] part=${i + 1}/${chunks}: ${h.substring(i * 1500, (i + 1) * 1500)}`,
        );
      }
    }
  }

  let hallMenus = menuPanelHtml ? parseMenusWithDates(menuPanelHtml) : [];

  if (hallMenus.length === 0 && childUnitsHtml) {
    const fromChild = parseMenusWithDates(childUnitsHtml);
    if (fromChild.length > 0) {
      console.log(
        `  [menus] ${hall.name}: found ${fromChild.length} dated menus in childUnitsPanel`,
      );
      hallMenus = fromChild;
    }
  }

  if (hallMenus.length === 0 && itemPanelHtml) {
    const fromItem = parseMenusWithDates(itemPanelHtml);
    if (fromItem.length > 0) {
      console.log(
        `  [menus] ${hall.name}: found ${fromItem.length} dated menus in itemPanel`,
      );
      hallMenus = fromItem;
    }
  }

  if (hallMenus.length > 0) {
    console.log(
      `  Hall ${hall.name} exposes ${hallMenus.length} dated menus — splitting into per-meal stations`,
    );
    totalItems += await processHallMenuList(
      supabase,
      session,
      hallData.id,
      hall.unitOid,
      hallMenus,
    );
    return { hallName: hall.name, itemsCount: totalItems };
  }

  if (itemPanelHtml && itemPanelHtml.includes("cbo_nn_itemHover")) {
    console.log(
      `  Hall ${hall.name} returned items directly (no stations, no menu list)`,
    );

    const { data: stationData, error: stationError } = await supabase
      .from("stations")
      .upsert(
        {
          dining_hall_id: hallData.id,
          name: hall.name,
          unit_oid: hall.unitOid,
        },
        { onConflict: "unit_oid" },
      )
      .select("id")
      .single();

    if (!stationError && stationData) {
      totalItems += await processItemPanel(
        supabase,
        session,
        stationData.id,
        itemPanelHtml,
      );
    }

    return { hallName: hall.name, itemsCount: totalItems };
  }

  const stations = parseStations(childUnitsHtml);
  console.log(`  Found ${stations.length} stations`);

  if (stations.length === 0) {
    console.log(
      "  childUnitsHtml sample (first 500 chars):",
      childUnitsHtml.substring(0, 500),
    );

    console.log(
      `  Trying SelectUnitFromChildUnitsList as fallback for ${hall.name}...`,
    );
    const childFallback = await postWithRetry(
      session,
      "/Unit/SelectUnitFromChildUnitsList",
      { unitOid: hall.unitOid },
    );

    // DEBUG: dump childFallback panel HTML for Woodworth
    if (hall.name.toLowerCase().includes("woodworth")) {
      try {
        const parsed = JSON.parse(childFallback);
        if (Array.isArray(parsed.panels)) {
          for (const p of parsed.panels as { id: string; html?: string }[]) {
            const h = (p.html ?? "").replace(/\s+/g, " ").trim();
            if (!h) continue;
            const chunks = Math.ceil(h.length / 1500);
            for (let i = 0; i < chunks; i++) {
              console.log(
                `  [WOODWORTH-FALLBACK] panel=${p.id} part=${i + 1}/${chunks}: ${h.substring(i * 1500, (i + 1) * 1500)}`,
              );
            }
          }
        }
      } catch {
        console.log(`  [WOODWORTH-FALLBACK] non-JSON: ${childFallback.substring(0, 2000)}`);
      }
    }

    if (!isStartupError(childFallback)) {
      const fallbackItemHtml = extractPanelHtml(childFallback, "itemPanel");
      const fallbackChildHtml = extractPanelHtml(
        childFallback,
        "childUnitsPanel",
      );

      if (fallbackItemHtml && fallbackItemHtml.includes("cbo_nn_itemHover")) {
        console.log(`  Fallback: found items directly for ${hall.name}`);
        const { data: stationData, error: stationError } = await supabase
          .from("stations")
          .upsert(
            {
              dining_hall_id: hallData.id,
              name: hall.name,
              unit_oid: hall.unitOid,
            },
            { onConflict: "unit_oid" },
          )
          .select("id")
          .single();

        if (!stationError && stationData) {
          totalItems += await processItemPanel(
            supabase,
            session,
            stationData.id,
            fallbackItemHtml,
          );
        }
      } else {
        const fallbackStations = parseStations(fallbackChildHtml);
        console.log(
          `  Fallback: found ${fallbackStations.length} child units for ${hall.name}`,
        );

        for (const fStation of fallbackStations) {
          console.log(
            `    Fallback station: ${fStation.name} (${fStation.unitOid})`,
          );

          const { data: stationData, error: stationError } = await supabase
            .from("stations")
            .upsert(
              {
                dining_hall_id: hallData.id,
                name: fStation.name,
                unit_oid: fStation.unitOid,
              },
              { onConflict: "unit_oid" },
            )
            .select("id")
            .single();

          if (stationError || !stationData) continue;

          const nestedRes = await postWithRetry(
            session,
            "/Unit/SelectUnitFromChildUnitsList",
            { unitOid: fStation.unitOid },
          );
          if (isStartupError(nestedRes)) continue;

          const nestedItemHtml = extractPanelHtml(nestedRes, "itemPanel");
          if (nestedItemHtml && nestedItemHtml.includes("cbo_nn_itemHover")) {
            totalItems += await processItemPanel(
              supabase,
              session,
              stationData.id,
              nestedItemHtml,
            );
          }
        }
      }
    }

    return { hallName: hall.name, itemsCount: totalItems };
  }

  for (const station of stations) {
    console.log(`  Station: ${station.name} (unitOid: ${station.unitOid})`);

    const { data: stationData, error: stationError } = await supabase
      .from("stations")
      .upsert(
        {
          dining_hall_id: hallData.id,
          name: station.name,
          unit_oid: station.unitOid,
        },
        { onConflict: "unit_oid" },
      )
      .select("id")
      .single();

    if (stationError) {
      console.error(`  Error upserting station ${station.name}:`, stationError);
      continue;
    }

    const childResponse = await postWithRetry(
      session,
      "/Unit/SelectUnitFromChildUnitsList",
      { unitOid: station.unitOid },
    );

    if (isStartupError(childResponse)) {
      console.log(`    Skipping station ${station.name}: Start-up Error`);
      continue;
    }

    const stationItemHtml = extractPanelHtml(childResponse, "itemPanel");

    if (stationItemHtml && stationItemHtml.includes("cbo_nn_itemHover")) {
      totalItems += await processItemPanel(
        supabase,
        session,
        stationData.id,
        stationItemHtml,
      );
      continue;
    }

    const nestedChildHtml = extractPanelHtml(
      childResponse,
      "childUnitsPanel",
    );
    const nestedStations = parseStations(nestedChildHtml);

    if (nestedStations.length > 0) {
      console.log(
        `    Nested stations found: ${nestedStations.length}, drilling down...`,
      );

      for (const nested of nestedStations) {
        const nestedResponse = await postWithRetry(
          session,
          "/Unit/SelectUnitFromChildUnitsList",
          { unitOid: nested.unitOid },
        );
        if (isStartupError(nestedResponse)) continue;

        const nestedItemHtml = extractPanelHtml(
          nestedResponse,
          "itemPanel",
        );
        if (nestedItemHtml && nestedItemHtml.includes("cbo_nn_itemHover")) {
          totalItems += await processItemPanel(
            supabase,
            session,
            stationData.id,
            nestedItemHtml,
          );
        }
      }
      continue;
    }

    console.log(
      `    Station ${station.name} has no items/children — trying daily menu drill-in`,
    );
    const dailyCount = await processDailyMenuStation(
      supabase,
      session,
      stationData.id,
      childResponse,
    );
    if (dailyCount > 0) {
      totalItems += dailyCount;
    } else {
      console.log(`    No daily menu items recovered for ${station.name}`);
    }
  }

  return { hallName: hall.name, itemsCount: totalItems };
}

/** Fire-and-forget child invocation. Does NOT await response (avoids parent timeout). */
function dispatchHallScrape(
  supabaseUrl: string,
  anonKey: string,
  hall: { name: string; unitOid: number },
  wipe: boolean,
): void {
  fetch(`${supabaseUrl}/functions/v1/netnutrition-scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ hallUnitOid: hall.unitOid, wipe }),
  }).catch((err) => {
    console.error(`Failed to dispatch ${hall.name}:`, err);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await readRequestBody(req);
    const hallUnitOid = typeof body.hallUnitOid === "number" ? body.hallUnitOid : undefined;
    const wipe = body.wipe ?? true;

    if (hallUnitOid) {
      const hall = KNOWN_HALLS.find((entry) => entry.unitOid === hallUnitOid) ?? {
        name: `Hall ${hallUnitOid}`,
        unitOid: hallUnitOid,
      };

      console.log(`Starting single-hall scrape for ${hall.name}...`);
      const result = await scrapeSingleHall(supabase, hall, wipe);

      await supabase.from("scrape_logs").insert({
        status: "success",
        message: `${result.hallName}: scraped ${result.itemsCount} items`,
        items_count: result.itemsCount,
      });

      return new Response(
        JSON.stringify({
          success: true,
          hallName: result.hallName,
          message: `${result.hallName} scraped successfully`,
          itemsCount: result.itemsCount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Starting NetNutrition full refresh...");
    const discoverySession = await initSession();
    const discoveredHalls = await discoverDiningHalls(discoverySession);

    console.log(
      `Dispatching ${discoveredHalls.length} hall scrapes (fire-and-forget):`,
      discoveredHalls.map((h) => `${h.name}(${h.unitOid})`).join(", "),
    );

    await supabase.from("scrape_logs").insert({
      status: "running",
      message: `Started refresh for ${discoveredHalls.length} halls`,
      items_count: 0,
    });

    // Fire-and-forget every hall. Each child invocation is its own edge function call
    // with its own wall-clock budget. They self-log to scrape_logs.
    // Stagger dispatch slightly so we don't slam NetNutrition all at once.
    for (let i = 0; i < discoveredHalls.length; i++) {
      dispatchHallScrape(supabaseUrl, anonKey, discoveredHalls[i], wipe);
      if (i < discoveredHalls.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Dispatched ${discoveredHalls.length} hall scrapes. They will complete in the background — check back in 1–3 minutes.`,
        hallsDispatched: discoveredHalls.length,
        halls: discoveredHalls.map((h) => h.name),
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Scrape error:", error);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      await supabase.from("scrape_logs").insert({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } catch {
      // ignore logging error
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Scrape failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});