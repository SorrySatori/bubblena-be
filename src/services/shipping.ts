import axios from "axios"
import crypto from "crypto"
import { Builder, parseStringPromise } from "xml2js"
import { OrderModel, type Order } from "../models/Order"

// Carrier integrations (Packeta / GLS), driven by the ORDER STORED IN THE DB.
// A shipment is created only after the order is paid (Stripe webhook) or the
// admin confirms a bank transfer – never from the storefront.

export interface ShipmentResult {
  externalId: string
  labelBase64?: string | null
}

// ---------------------------------------------------------------- Packeta ---

async function createPacketaShipment(order: Order): Promise<ShipmentResult> {
  const apiPassword = process.env.PACKETA_API_KEY
  if (!apiPassword) throw new Error("PACKETA_API_KEY není nastaven")

  const point = order.selectedPickupPoint
  if (!point?.id) throw new Error("Objednávka nemá vybrané výdejní místo Zásilkovny")

  const xml = new Builder({ headless: true }).buildObject({
    createPacket: {
      apiPassword,
      packetAttributes: {
        number: order.orderId,
        name: order.customerInfo.firstName,
        surname: order.customerInfo.lastName,
        email: order.customerInfo.email,
        phone: order.customerInfo.phone,
        addressId: point.id,
        weight: 0.5,
        value: order.totals.total,
        company: "Bubblena",
        eshop: "bubblena.cz",
      },
    },
  })

  const { data } = await axios.post("https://www.zasilkovna.cz/api/rest", xml, {
    headers: { "Content-Type": "application/xml" },
    timeout: 20000,
  })

  const parsed = await parseStringPromise(String(data), { explicitArray: false })
  const response = parsed?.response
  if (!response || response.status !== "ok") {
    const detail = response?.string || response?.fault || JSON.stringify(response?.detail || response)
    throw new Error(`Packeta: ${detail}`)
  }

  const externalId = response.result?.barcode || response.result?.id
  if (!externalId) throw new Error("Packeta: odpověď neobsahuje id zásilky")
  return { externalId: String(externalId) }
}

// -------------------------------------------------------------------- GLS ---

function glsPasswordHash(password: string): number[] {
  // MyGLS expects the SHA-512 hash of the password as a byte array.
  const hash = crypto.createHash("sha512").update(Buffer.from(password, "utf8")).digest()
  return Array.from(new Uint8Array(hash))
}

async function createGlsShipment(order: Order): Promise<ShipmentResult> {
  const clientNumber = Number(process.env.GLS_CLIENT_NUMBER)
  const password = process.env.GLS_API_PASSWORD
  const username = process.env.GLS_API_USERNAME
  const glsApiUrl = process.env.GLS_API_URL || "https://api.mygls.cz/ParcelService.svc/json/PrepareLabels"
  if (!password || !username || !clientNumber) {
    throw new Error("GLS_API_USERNAME, GLS_API_PASSWORD a GLS_CLIENT_NUMBER musí být nastaveny")
  }

  const point = order.selectedPickupPoint
  if (!point?.id) throw new Error("Objednávka nemá vybrané výdejní místo GLS")

  const c = order.customerInfo
  const fullName = `${c.firstName} ${c.lastName}`

  const payload = {
    Username: username,
    Password: glsPasswordHash(password),
    ParcelList: [
      {
        ClientNumber: clientNumber,
        ClientReference: order.orderId,
        Count: 1,
        Content: "Cosmetics / Bath bombs",
        CODAmount: 0,
        CODCurrency: "CZK",
        PickupAddress: {
          Name: process.env.GLS_SENDER_NAME || "Hedvika Antošová",
          Street: process.env.GLS_SENDER_STREET || "Pobialova",
          HouseNumber: process.env.GLS_SENDER_HOUSE_NUMBER || "23",
          ZipCode: Number(process.env.GLS_SENDER_ZIP) || 70200,
          City: process.env.GLS_SENDER_CITY || "Ostrava",
          CountryIsoCode: "CZ",
        },
        // ParcelShop delivery: the delivery address is the pickup point itself.
        DeliveryAddress: {
          Name: fullName,
          Street: point.street || "",
          HouseNumber: point.houseNumber || "",
          ZipCode: point.zip || "",
          City: point.city || "",
          CountryIsoCode: point.country || "CZ",
          ContactName: fullName,
          ContactPhone: c.phone,
          ContactEmail: c.email,
        },
        ServiceList: [],
        ParcelShopID: point.id,
      },
    ],
    WebshopEngine: "CustomNodeJSApp",
  }

  const { data } = await axios.post(glsApiUrl, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  })

  const errors = data?.PrepareLabelsError || data?.PrintLabelsErrorList
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0]
    throw new Error(`GLS: ${first?.ErrorDescription || first?.ErrorCode || JSON.stringify(first)}`)
  }

  const parcelNumber =
    data?.ParcelInfoList?.[0]?.ParcelNumber ??
    data?.PrintLabelsInfoList?.[0]?.ParcelNumber ??
    data?.Parcels?.[0]?.ParcelNumber
  if (!parcelNumber) throw new Error("GLS: odpověď neobsahuje číslo balíku")

  const rawLabel = data?.Labels ?? data?.PDF
  const labelBase64 = Array.isArray(rawLabel)
    ? Buffer.from(rawLabel).toString("base64")
    : typeof rawLabel === "string" && rawLabel
      ? rawLabel
      : null

  return { externalId: String(parcelNumber), labelBase64 }
}

// ---------------------------------------------------------------- driver ---

const PROVIDERS: Record<string, (order: Order) => Promise<ShipmentResult>> = {
  zasilkovna: createPacketaShipment,
  gls: createGlsShipment,
}

/** Statuses in which a shipment may be created. */
const SHIPPABLE_STATUSES = ["paid", "processing"]

export type CreateShipmentOutcome =
  | { outcome: "created"; externalId: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "failed"; error: string }

/**
 * Creates the carrier shipment for an order exactly once. The `shipment.status`
 * field is used as a lock: only an order that is paid/processing and has no
 * shipment in flight or created is claimed. Safe to call from the webhook, the
 * status PATCH and the admin "retry" button at the same time.
 */
export async function createShipmentForOrder(orderId: string): Promise<CreateShipmentOutcome> {
  const claimed = await OrderModel.findOneAndUpdate(
    {
      orderId,
      status: { $in: SHIPPABLE_STATUSES },
      "shipment.status": { $nin: ["creating", "created"] },
    },
    { $set: { "shipment.status": "creating", "shipment.error": null } },
    { new: true }
  )

  if (!claimed) {
    const existing = await OrderModel.findOne({ orderId })
    if (!existing) return { outcome: "skipped", reason: "Objednávka nenalezena." }
    if (existing.shipment?.status === "created") {
      return { outcome: "created", externalId: existing.shipment.externalId || "" }
    }
    if (existing.shipment?.status === "creating") {
      return { outcome: "skipped", reason: "Zásilka se právě vytváří." }
    }
    return { outcome: "skipped", reason: `Objednávka není zaplacená (stav ${existing.status}).` }
  }

  const provider = PROVIDERS[claimed.shippingMethod]
  if (!provider) {
    await OrderModel.updateOne(
      { orderId },
      { $set: { "shipment.status": "failed", "shipment.error": `Neznámý dopravce ${claimed.shippingMethod}` } }
    )
    return { outcome: "failed", error: `Neznámý dopravce ${claimed.shippingMethod}` }
  }

  try {
    const result = await provider(claimed)
    await OrderModel.updateOne(
      { orderId },
      {
        $set: {
          "shipment.provider": claimed.shippingMethod,
          "shipment.status": "created",
          "shipment.externalId": result.externalId,
          "shipment.labelBase64": result.labelBase64 ?? null,
          "shipment.error": null,
          "shipment.createdAt": new Date(),
        },
      }
    )
    return { outcome: "created", externalId: result.externalId }
  } catch (err: any) {
    const message = String(err?.response?.data ? JSON.stringify(err.response.data) : err?.message || err).slice(0, 1000)
    console.error(`Shipment creation failed for order ${orderId}:`, message)
    await OrderModel.updateOne(
      { orderId },
      { $set: { "shipment.provider": claimed.shippingMethod, "shipment.status": "failed", "shipment.error": message } }
    )
    return { outcome: "failed", error: message }
  }
}
