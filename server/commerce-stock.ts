import { getCollection, getStore, saveStore, transaction } from "./storage.js";
type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
export function expireShopReservations(now = Date.now()) {
  const expired = rows("shopOrders").filter(
    (o) =>
      o.source === "storefront" &&
      o.status === "reserved" &&
      Date.parse(o.reservationExpiresAt) <= now,
  );
  if (!expired.length) return;
  transaction(() => {
    for (const order of expired) {
      order.status = "cancelled";
      order.version++;
      order.events.push({
        status: "cancelled",
        at: new Date(now).toISOString(),
        actor: "STOCRANT",
        reason: "Reservation expired",
      });
    }
    saveStore(getStore());
  });
}
export function reservedStock(itemId: string) {
  return rows("shopOrders")
    .filter((order) => ["reserved", "preparing"].includes(order.status))
    .reduce(
      (sum, order) =>
        sum +
        order.lines
          .filter((line: Row) => line.inventoryItemId === itemId)
          .reduce((n: number, line: Row) => n + line.quantity, 0),
      0,
    );
}
export function physicalStock(item: Row) {
  return (
    Number(item.openingStock || 0) +
    rows("inventoryMovements")
      .filter((m) => m.inventoryItemId === item.id)
      .reduce(
        (n, m) => n + Number(m.quantity) * (m.type === "outgoing" ? -1 : 1),
        0,
      )
  );
}
/** Called at execution time too, so delayed approvals cannot consume reserved stock. */
export function protectCommerceStock(
  collection: string,
  action: string,
  payload: Row,
  current?: Row,
) {
  expireShopReservations();
  if (
    collection === "inventoryItems" &&
    current &&
    rows("shopProducts").some((p) => p.inventoryItemId === current.id)
  ) {
    if (
      action === "delete" ||
      ["organizationId", "locationId", "sku", "openingStock"].some(
        (key) => payload[key] !== undefined && payload[key] !== current[key],
      )
    )
      throw new Error(
        "This item is linked to a shop product. Keep its company, SKU and opening stock; use stock movements instead.",
      );
  }
  if (collection !== "inventoryMovements") return;
  if (current?.shopOrderId || current?.shopReceiptId)
    throw new Error("Shop stock records are immutable. Use the shop workflow.");
  const itemId = String(
    payload.inventoryItemId ?? current?.inventoryItemId ?? "",
  );
  const item = rows("inventoryItems").find((i) => i.id === itemId);
  if (!item || !rows("shopProducts").some((p) => p.inventoryItemId === itemId))
    return;
  const effect = (row: Row) =>
    Number(row.quantity || 0) * (row.type === "outgoing" ? -1 : 1);
  const next =
    physicalStock(item) -
    (current ? effect(current) : 0) +
    (action === "delete" ? 0 : effect({ ...current, ...payload }));
  if (next < reservedStock(itemId))
    throw new Error(
      "This movement would consume stock reserved for shop orders.",
    );
}
