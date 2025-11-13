import express from "express";
import axios from "axios";
import { Builder } from "xml2js";

const router = express.Router();

router.post("/create-shipment", async (req, res) => {
  const { customerInfo, selectedPickupPoint, cartId, totals, orderId } = req.body

  const apiPassword = process.env.PACKETA_API_KEY
  const apiUrl = "https://www.zasilkovna.cz/api/rest"

  const builder = new Builder({ headless: true });
  const xmlData = builder.buildObject({
    createPacket: {
      apiPassword,
      packetAttributes: {
          number: orderId,
          name: customerInfo.firstName,
          surname: customerInfo.lastName,
          email: customerInfo.email,
          phone: customerInfo.phone,
          addressId: selectedPickupPoint?.id,
          weight: 0.5,
          value: totals.subtotal,
          company: "Bubblena",
          eshop: "bubblena.cz",
      },
    },
  })

  try {
    const response = await axios.post(apiUrl, xmlData, {
      headers: { "Content-Type": "application/xml" },
    });

    res.status(200).send({ success: true, response: response.data });
  } catch (error) {
    console.error("Packeta API chyba:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Status:", error.response.status);
    }

    res.status(500).send({
      success: false,
      error: error.message,
      details: error.response?.data || null,
    })
  }
})

export default router
