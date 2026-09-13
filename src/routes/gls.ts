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

router.post("/create-shipment", async (req, res) => {
  const { customerInfo, selectedPickupPoint, totals, orderId } = req.body
  try {
    const clientNumber = Number(process.env.GLS_CLIENT_NUMBER)
    const password = process.env.GLS_API_PASSWORD
    const username = process.env.GLS_API_USERNAME
    const glsApiUrl = process.env.GLS_API_URL || 'https://api.mygls.cz/ParcelService.svc/json/PrepareLabels'

    if (!password || !username || !clientNumber) {
      throw new Error('GLS_API_USERNAME, GLS_API_PASSWORD and GLS_CLIENT_NUMBER must be set in environment')
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

    const response = await axios.post(
    glsApiUrl,
      payload,
      {
        headers: { "Content-Type": "application/json" }
      }
    );
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

export default router;
