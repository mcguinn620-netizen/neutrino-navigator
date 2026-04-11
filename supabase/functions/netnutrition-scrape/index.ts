import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "http://netnutrition.bsu.edu/NetNutrition/1";

// Known dining halls with their unit OIDs (from site inspection)
const DINING_HALLS = [
  { name: "The Atrium", unitOid: 1 },
  { name: "Atrium Cafe", unitOid: 2 },
  { name: "Noyer", unitOid: 3 },
  { name: "Student Center Tally", unitOid: 4 },
  { name: "North Dining", unitOid: 5 },
  { name: "Woodworth Commons", unitOid: 6 },
  { name: "Bookmark Cafe", unitOid: 7 },
  { name: "Tom John Food Shop", unitOid: 8 },
];

interface SessionState {
  cookies: string[];
}

async function initSession(): Promise<SessionState> {
  const res = await fetch(BASE_URL, { redirect: "follow" });
  const cookies: string[] = [];
  const setCookies = res.headers.getSetCookie?.() || [];
  for (const c of setCookies) {
    cookies.push(c.split(";")[0]);
  }
  // Also try the raw header
  const rawSet = res.headers.get("set-cookie");
  if (rawSet && cookies.length === 0) {
    cookies.push(rawSet.split(";")[0]);
  }
  await res.text(); // consume body
  return { cookies };
}

async function postWithSession(
  session: SessionState,
  path: string,
  body: Record<string, string | number>
): Promise<string> {
  const formData = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    formData.append(k, String(v));
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: session.cookies.join("; "),
      "X-Requested-With": "XMLHttpRequest",
    },
    body: formData.toString(),
  });

  // Update cookies
  const setCookies = res.headers.getSetCookie?.() || [];
  for (const c of setCookies) {
    const name = c.split("=")[0];
    session.cookies = session.cookies.filter((x) => !x.startsWith(name + "="));
    session.cookies.push(c.split(";")[0]);
  }

  return await res.text();
}

function parseStations(html: string): { name: string; unitOid: number }[] {
  const stations: { name: string; unitOid: number }[] = [];
  // Pattern: onclick="javascript:SelectChildUnit(123)" or similar
  const regex =
    /SelectChildUnit\((\d+)\)[^>]*>([^<]+)</gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    stations.push({
      unitOid: parseInt(match[1]),
      name: match[2].trim(),
    });
  }

  // Alternative pattern from the site
  if (stations.length === 0) {
    const altRegex =
      /data-unitoid="(\d+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)</gi;
    while ((match = altRegex.exec(html)) !== null) {
      stations.push({
        unitOid: parseInt(match[1]),
        name: match[2].trim(),
      });
    }
  }

  // Try another pattern: links with unitOid in onclick
  if (stations.length === 0) {
    const linkRegex =
      /onclick="[^"]*?(\d+)[^"]*?"[^>]*>\s*([^<]+)\s*</gi;
    while ((match = linkRegex.exec(html)) !== null) {
      const oid = parseInt(match[1]);
      if (oid > 0) {
        stations.push({ unitOid: oid, name: match[2].trim() });
      }
    }
  }

  return stations;
}

function parseFoodItems(
  html: string
): { name: string; detailOid: number; allergens: string[]; dietaryFlags: string[]; servingSize: string }[] {
  const items: {
    name: string;
    detailOid: number;
    allergens: string[];
    dietaryFlags: string[];
    servingSize: string;
  }[] = [];

  // Parse rows from the items table
  const rowRegex = /<tr[^>]*class="[^"]*cbo_nn_itemRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    // Extract item name and detailOid
    const nameMatch = row.match(
      /SelectItemDetail\((\d+)\)[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!nameMatch) continue;

    const detailOid = parseInt(nameMatch[1]);
    const name = nameMatch[2].replace(/<[^>]+>/g, "").trim();

    // Extract allergens from img title attributes
    const allergens: string[] = [];
    const dietaryFlags: string[] = [];
    const imgRegex = /<img[^>]*title="([^"]*)"[^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(row)) !== null) {
      const title = imgMatch[1].trim();
      if (
        title.toLowerCase().includes("vegan") ||
        title.toLowerCase().includes("vegetarian")
      ) {
        dietaryFlags.push(title);
      } else if (title) {
        allergens.push(title);
      }
    }

    // Extract serving size
    const servingMatch = row.match(
      /cbo_nn_itemServingSize[^>]*>([^<]*)</i
    );
    const servingSize = servingMatch ? servingMatch[1].trim() : "";

    items.push({ name, detailOid, allergens, dietaryFlags, servingSize });
  }

  // Simpler fallback pattern
  if (items.length === 0) {
    const simpleRegex =
      /SelectItemDetail\((\d+)\)[^>]*>\s*([^<]+)/gi;
    let simpleMatch;
    while ((simpleMatch = simpleRegex.exec(html)) !== null) {
      items.push({
        name: simpleMatch[2].trim(),
        detailOid: parseInt(simpleMatch[1]),
        allergens: [],
        dietaryFlags: [],
        servingSize: "",
      });
    }
  }

  return items;
}

function parseNutrients(html: string): Record<string, string> {
  const nutrients: Record<string, string> = {};

  // Parse nutrition label rows
  const rowRegex =
    /<span[^>]*class="[^"]*cbo_nn_LabelHeader[^"]*"[^>]*>([^<]*)<\/span>[\s\S]*?<span[^>]*class="[^"]*cbo_nn_LabelBoundary[^"]*"[^>]*>([^<]*)<\/span>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const label = match[1].trim();
    const value = match[2].trim();
    if (label && value) {
      nutrients[label] = value;
    }
  }

  // Alternative: simpler table-based parsing
  if (Object.keys(nutrients).length === 0) {
    const tdRegex =
      /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(html)) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    for (let i = 0; i < cells.length - 1; i += 2) {
      if (cells[i] && cells[i + 1]) {
        nutrients[cells[i]] = cells[i + 1];
      }
    }
  }

  return nutrients;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const hallFilter = body.hallUnitOid as number | undefined;

    console.log("Starting NetNutrition scrape...");

    // Init session
    const session = await initSession();
    console.log("Session established, cookies:", session.cookies.length);

    const hallsToScrape = hallFilter
      ? DINING_HALLS.filter((h) => h.unitOid === hallFilter)
      : DINING_HALLS;

    let totalItems = 0;

    for (const hall of hallsToScrape) {
      console.log(`Scraping dining hall: ${hall.name} (OID: ${hall.unitOid})`);

      // Upsert dining hall
      const { data: hallData, error: hallError } = await supabase
        .from("dining_halls")
        .upsert({ name: hall.name, unit_oid: hall.unitOid }, { onConflict: "unit_oid" })
        .select("id")
        .single();

      if (hallError) {
        console.error("Error upserting hall:", hallError);
        continue;
      }

      // Select dining hall to get stations
      const stationsHtml = await postWithSession(
        session,
        "/Unit/SelectUnitFromSideBar",
        { unitOid: hall.unitOid }
      );

      const stations = parseStations(stationsHtml);
      console.log(`  Found ${stations.length} stations`);

      for (const station of stations) {
        // Upsert station
        const { data: stationData, error: stationError } = await supabase
          .from("stations")
          .upsert(
            {
              dining_hall_id: hallData.id,
              name: station.name,
              unit_oid: station.unitOid,
            },
            { onConflict: "unit_oid" }
          )
          .select("id")
          .single();

        if (stationError) {
          console.error("Error upserting station:", stationError);
          continue;
        }

        // Get food items for this station
        const itemsHtml = await postWithSession(
          session,
          "/Unit/SelectUnitFromChildUnitsList",
          { unitOid: station.unitOid }
        );

        const foodItems = parseFoodItems(itemsHtml);
        console.log(`    Station ${station.name}: ${foodItems.length} items`);

        for (const item of foodItems) {
          // Get nutrition details
          let nutrients: Record<string, string> = {};
          try {
            await postWithSession(session, "/Menu/SelectItem", {
              detailOid: item.detailOid,
            });
            const nutritionHtml = await postWithSession(
              session,
              "/NutritionDetail/ShowMenuDetailNutritionGrid",
              {}
            );
            nutrients = parseNutrients(nutritionHtml);
          } catch (e) {
            console.error(`    Error fetching nutrition for ${item.name}:`, e);
          }

          // Upsert food item
          const { error: itemError } = await supabase
            .from("food_items")
            .upsert(
              {
                station_id: stationData.id,
                name: item.name,
                detail_oid: item.detailOid,
                serving_size: item.servingSize || null,
                allergens: item.allergens,
                dietary_flags: item.dietaryFlags,
                nutrients,
              },
              { onConflict: "detail_oid" }
            );

          if (itemError) {
            console.error("Error upserting food item:", itemError);
          } else {
            totalItems++;
          }
        }
      }
    }

    // Log scrape
    await supabase.from("scrape_logs").insert({
      status: "success",
      message: `Scraped ${totalItems} items from ${hallsToScrape.length} halls`,
      items_count: totalItems,
    });

    console.log(`Scrape complete: ${totalItems} items`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scraped ${totalItems} items from ${hallsToScrape.length} dining halls`,
        itemsCount: totalItems,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    } catch (_) {
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
      }
    );
  }
});
