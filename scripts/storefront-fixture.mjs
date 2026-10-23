import { randomBytes, randomUUID } from "node:crypto";
/** Used only by browser/preview checks that create an explicitly isolated store. */
export async function seedAmal(base) {
  const password = randomBytes(24).toString("hex");
  let cookie = "";
  async function req(path, method = "GET", body) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(`${response.status}: ${JSON.stringify(data)}`);
    return { response, data };
  }
  const setup = await req("/auth/setup", "POST", {
    name: "Amal Preview Owner",
    email: "owner@amal-preview.test",
    password,
    setupKey: "local-setup",
  });
  cookie = setup.response.headers.get("set-cookie").split(";")[0];
  const org = (
    await req("/collections/organizations", "POST", {
      name: "Amal Commerce — Preview",
      status: "active",
    })
  ).data.item;
  const company = (
    await req("/collections/companies", "POST", {
      name: "Amal Retail",
      parentOrganizationId: org.id,
      status: "active",
      organizationType: "store",
      industry: "retail",
      currency: "SDG",
    })
  ).data.item;
  const products = (
    await req(`/workspace/shops/${company.id}/products`, "POST", {
      products: [
        {
          sku: "AMAL-01",
          name: "Everyday tea",
          price: "18.50",
          category: "Tea & pantry",
          description:
            "A preview product for testing the shop. Replace this listing with your real product details before launch.",
        },
        {
          sku: "AMAL-02",
          name: "The daily notebook",
          price: "24.00",
          category: "Desk essentials",
          description:
            "A preview item for notes, plans and small ideas. This is illustrative catalog data.",
        },
        {
          sku: "AMAL-03",
          name: "Cotton market bag",
          price: "32.00",
          category: "Everyday carry",
          description:
            "An illustrative product listing used only in the isolated Amal preview.",
        },
        {
          sku: "AMAL-04",
          name: "A quiet morning",
          price: "45.00",
          category: "Tea & pantry",
          description:
            "A preview gift bundle used to test product discovery, cart quantities and stock reservations.",
        },
      ],
    })
  ).data.products;
  for (const p of products)
    await req(`/workspace/shops/${company.id}/receipts`, "POST", {
      requestId: randomUUID(),
      productId: p.id,
      quantity: 12,
      supplier: "Preview stock only",
      reference: `AMAL-PREVIEW-${p.sku}`,
    });
  const defaults = (await req(`/workspace/storefronts/${company.id}`)).data
    .settings;
  const settings = (
    await req(`/workspace/storefronts/${company.id}`, "PUT", {
      ...defaults,
      name: "Amal",
      slug: "amal",
      tagline: "Everyday things, thoughtfully chosen.",
      description:
        "A thoughtful collection for the little moments. Discover pieces for your daily rituals, your work and everything in between.",
      address: "Preview collection point — replace before launch",
      contactEmail: "hello@amal-preview.test",
      phone: "+249 900000000",
      deliveryEnabled: true,
      deliveryRegions: "Example City, Nearby City",
      deliveryFee: "5.00",
      shippingPolicy:
        "Preview policy only. Delivery is limited to the configured example regions. Replace with your actual delivery timings and charges before launch.",
      returnsPolicy:
        "Preview policy only. Contact the shop to discuss a return. Replace with your actual return conditions before launch.",
      privacyPolicy:
        "Preview policy only. Contact details are used to process the order and arrange fulfilment. Replace with the company's complete privacy policy before launch.",
      terms:
        "Preview terms only. Orders are subject to available stock. Payment is arranged on delivery or collection. No online payment is collected. Replace before launch.",
      manualPaymentsAccepted: true,
      published: true,
    })
  ).data.settings;
  return { req, cookie, password, company, products, settings };
}
