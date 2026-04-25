// src/routes/gls-create-shipment.ts
import express from "express";
import axios from "axios";
import crypto from "crypto";

const router = express.Router();

function hashPassword(password: string): number[] {
  // MyGLS API expects SHA512 hash of the password as a byte array (list of unsigned integers)
  const hash = crypto.createHash('sha512').update(Buffer.from(password, 'utf8')).digest();
  return Array.from(new Uint8Array(hash));
}

// Quick self-test endpoint to verify auth without a full shipment
async function testGlsAuth(username: string, password: string, glsApiUrl: string) {
  const payload = {
    Username: username,
    Password: hashPassword(password),
    ParcelList: [],
  }
  const response = await axios.post(glsApiUrl, payload, {
    headers: { "Content-Type": "application/json" }
  })
  return response.data
}

router.post("/create-shipment", async (req, res) => {
  const { customerInfo, selectedPickupPoint, totals, orderId } = req.body
  try {
    const clientNumber = Number(process.env.GLS_CLIENT_NUMBER) || 53013682
    const password = process.env.GLS_API_PASSWORD
    const username = process.env.GLS_API_USERNAME
    const glsApiUrl = process.env.GLS_API_URL || 'https://api.mygls.cz/ParcelService.svc/json/PrepareLabels'

    if (!password || !username) {
      throw new Error('GLS_API_USERNAME and GLS_API_PASSWORD must be set in environment')
    }
    const payload = {
    Username: username,
    Password: hashPassword(password),
    ParcelList: [{
      ClientNumber: clientNumber,
      ClientReference: orderId,
      Count: 1,
      Content: "Cosmetics / Bath bombs",
      CODAmount: 0,
      CODCurrency: "CZK",

      PickupAddress: {
        // Name: process.env.GLS_SENDER_NAME,
        Name: 'Hedvika Antošová',
        // Street: process.env.GLS_SENDER_STREET,
        Street: 'Pobialova',
        // HouseNumber: process.env.GLS_SENDER_HOUSE_NUMBER,
        HouseNumber: '23',
        // ZipCode: process.env.GLS_SENDER_ZIP,
        ZipCode: 70200,
        // City: process.env.GLS_SENDER_CITY,
        City: 'Ostrava',
        CountryIsoCode: "CZ",
      },

      // ☑ ParcelShop = dodací adresa = GLS výdejní místo
      DeliveryAddress: {
        Name: `${customerInfo.firstName} ${customerInfo.lastName}`,
        Street: selectedPickupPoint.address || selectedPickupPoint.street || "",
        HouseNumber: selectedPickupPoint.houseNumber ?? "",
        ZipCode: selectedPickupPoint.zipcode || selectedPickupPoint.zip || "",
        City: selectedPickupPoint.city,
        CountryIsoCode: selectedPickupPoint.ctrcode || "CZ",
        ContactName: `${customerInfo.firstName} ${customerInfo.lastName}`,
        ContactPhone: customerInfo.phone,
        ContactEmail: customerInfo.email,
      },

      ServiceList: [],
      ParcelShopID: selectedPickupPoint.pclshopid || selectedPickupPoint.id || ""
    }],
    WebshopEngine: "CustomNodeJSApp",
  }
  console.log('REQUEST', JSON.stringify(payload, null, 2))

    const response = await axios.post(
    glsApiUrl,
      payload,
      {
        headers: { "Content-Type": "application/json" }
      }
    );
    console.log("GLS API odpověď:", response.data)
    res.status(200).send({
      success: true,
      parcelNumber: response.data?.Parcels?.[0]?.ParcelNumber,
      pdfLabelBase64: response.data?.PDF,  // můžeš uložit nebo poslat dál
      raw: response.data,
    });

  } catch (error: any) {
    console.error("GLS API chyba:", error.response?.data || error.message);
    res.status(500).send({
      success: false,
      message: "Chyba při vytváření zásilky v GLS API.",
      details: error.response?.data || error.message,
    });
  }
});

// Debug endpoint to test auth against both prod and test GLS APIs
router.get("/test-auth", async (req, res) => {
  const password = process.env.GLS_API_PASSWORD || '24M0IK18Ojy1GQxtf36kRlXsgZMj0p88'
  const username = process.env.GLS_API_USERNAME || 'info@bubblena.cz'

  const urls = [
    'https://api.mygls.cz/ParcelService.svc/json/PrepareLabels',
    'https://api.test.mygls.cz/ParcelService.svc/json/PrepareLabels',
  ]

  const results: any[] = []
  for (const url of urls) {
    try {
      const data = await testGlsAuth(username, password, url)
      results.push({ url, status: 'ok', data })
    } catch (error: any) {
      results.push({
        url,
        status: 'error',
        data: error.response?.data || error.message
      })
    }
  }

  console.log('GLS auth test results:', JSON.stringify(results, null, 2))
  res.json({ username, passwordHash: hashPassword(password).slice(0, 5).join(',') + '...', results })
})

export default router;
