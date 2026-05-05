import mongoose from "mongoose";

const DEFAULT_RESPONSE_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_MASTER_ID ?? "";

const BUILTIN_FORMS = [
  ["travel-booking", "Travel Booking", "Book a flight, hotel, or company travel.", 10, true, "Travel Booking Responses"],
  ["cash-advance", "Cash Advance", "Request advance funds for upcoming expenses.", 20, true, "Cash Advance Responses"],
  ["reimbursement", "Reimbursement", "Get reimbursed for expenses you already paid for.", 30, true, "Reimbursement Responses"],
  ["request-for-payment", "Request for Payment", "Request payment to a vendor or supplier.", 40, false, "Request for Payment Responses"],
  ["cashiering", "Cashiering", "Cashier-related transactions and requests.", 50, false, "Cashiering Responses"],
  ["leave-request", "Leave Request", "Submit planned leave requests for manager review and approval.", 70, false, "Leave Request Responses"],
];

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not defined.");

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  });

  const collection = mongoose.connection.db.collection("formdefinitions");
  for (const [slug, name, description, sortOrder, isImplemented, responseSheetName] of BUILTIN_FORMS) {
    await collection.updateOne(
      { slug },
      {
        $setOnInsert: { slug, source: "native" },
        $set: {
          name,
          description,
          routePath: `/forms/${slug}`,
          source: "native",
          status: "published",
          visibility: "everyone",
          availability: isImplemented ? "available" : "coming-soon",
          isImplemented,
          showInNavbar: isImplemented,
          sortOrder,
          writeResponsesToSheet: Boolean(DEFAULT_RESPONSE_SPREADSHEET_ID),
          responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
          responseSheetName,
        },
      },
      { upsert: true },
    );
    console.log(`Synced ${slug}`);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Built-in sync failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
